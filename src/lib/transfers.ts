/**
 * Orquestra ledger + cadeia para as transferências (SPEC.md › Fluxos). A confirmação é
 * "preguiçosa": `advance()` roda quando a tela consulta o status, sem worker.
 */
import { and, eq, max, sql } from "drizzle-orm";
import { getAddress, isAddressEqual, type Address, type Hex } from "viem";
import { accounts, transfers, type Account, type Transfer } from "../db/schema.ts";
import {
  broadcast,
  findInboundTransfers,
  findTransaction,
  getTxStatus,
  inboundAmountFromLogs,
  isNonceConsumed,
  sendCancel,
  signTreasuryTransfer,
  type ChainCtx,
} from "./chain.ts";
import type { AppDeps } from "./deps.ts";
import { HttpError, respond } from "./http.ts";
import { decodeTransfer } from "./erc20.ts";
import {
  confirmInbound,
  createOutbound,
  failInbound,
  findByClientRequestId,
  INBOUND_NOT_FOUND,
  recordInbound,
  refundOutbound,
  settleOutbound,
} from "./ledger.ts";
import { requireAccount } from "./account.ts";
import { parseAmount } from "./money.ts";

/** Chave do lock consultivo que serializa a escolha de nonce da tesouraria. */
const TREASURY_NONCE_LOCK = 4_242_001;

const view = (t: Transfer, confirmations?: bigint) => ({
  id: t.id,
  direction: t.direction,
  status: t.status,
  amountMicro: t.amountMicro,
  txHash: t.txHash,
  failureReason: t.failureReason,
  confirmations: confirmations ?? null,
  createdAt: t.createdAt,
});

type CreateBody = {
  direction?: unknown;
  amount?: unknown;
  txHash?: unknown;
  clientRequestId?: unknown;
};

/** POST /api/transfers */
export function handleCreateTransfer(req: Request, deps: AppDeps): Promise<Response> {
  return respond(async () => {
    const { account } = await requireAccount(req, deps);
    const body = (await req.json().catch(() => ({}))) as CreateBody;
    if (typeof body.clientRequestId !== "string" || body.clientRequestId.length < 8) {
      throw new HttpError(400, "pedido_invalido");
    }
    if (body.direction === "MB_TO_WALLET") {
      return view(
        await startOutbound(deps, account, String(body.amount ?? ""), body.clientRequestId),
      );
    }
    if (body.direction === "WALLET_TO_MB") {
      return view(await startInbound(deps, account, body.txHash, body.clientRequestId));
    }
    throw new HttpError(400, "pedido_invalido");
  });
}

/**
 * Wallet → MB: registra o tx que a carteira embutida enviou. Só aceita um tx visível
 * na rede, da carteira desta conta, para a Conta MB — senão alguém poderia registrar
 * antes o hash de outra pessoa e bloquear o crédito dela (o hash é único).
 */
async function startInbound(
  deps: AppDeps,
  account: Account,
  txHash: unknown,
  clientRequestId: string,
) {
  const wallet = account.walletAddress as Address | null;
  if (!wallet) throw new HttpError(409, "carteira_nao_ativada");
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new HttpError(400, "pedido_invalido");
  }
  const hash = txHash.toLowerCase() as Hex;
  const chain = await deps.chain();
  const tx = await findTransaction(chain, hash);
  if (!tx) throw new HttpError(409, "transacao_nao_encontrada");
  const call = decodeTransfer(tx.input);
  const valid =
    isAddressEqual(tx.from, wallet) &&
    tx.to !== null &&
    isAddressEqual(tx.to, chain.token) &&
    call !== null &&
    isAddressEqual(call.to, chain.treasury.address);
  if (!valid) throw new HttpError(422, "transacao_invalida");

  const recorded = await recordInbound(deps.db, {
    accountId: account.id,
    txHash: hash,
    amountMicro: call.amountMicro,
    clientRequestId,
    expiresAt: new Date(Date.now() + deps.config.observationWindowMs),
  });
  if (recorded) return recorded;
  // clientRequestId já usado por outra transferência desta conta: devolve aquela.
  const byRequest = await findByClientRequestId(deps.db, account.id, clientRequestId);
  if (!byRequest) throw new HttpError(409, "pedido_conflitante");
  return byRequest;
}

async function startOutbound(
  deps: AppDeps,
  account: Account,
  amount: string,
  clientRequestId: string,
) {
  const wallet = account.walletAddress as Address | null;
  if (!wallet) throw new HttpError(409, "carteira_nao_ativada");
  // Retry do mesmo pedido: devolve a transferência já criada antes de olhar o saldo
  // (que já caiu), senão repetir um saque do saldo inteiro falharia com saldo insuficiente.
  const already = await findByClientRequestId(deps.db, account.id, clientRequestId);
  if (already) return already;
  const parsed = parseAmount(amount, account.availableCents);
  if (!parsed.ok) throw new HttpError(422, parsed.reason);

  const chain = await deps.chain();
  let result;
  try {
    result = await createOutbound(
      deps.db,
      {
        accountId: account.id,
        cents: parsed.cents,
        clientRequestId,
        expiresAt: new Date(Date.now() + deps.config.observationWindowMs),
      },
      async (transfer, tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${TREASURY_NONCE_LOCK})`);
        const [{ highest }] = await tx
          .select({ highest: max(transfers.nonce) })
          .from(transfers)
          .where(and(eq(transfers.direction, "MB_TO_WALLET"), eq(transfers.status, "PROCESSANDO")));
        return signTreasuryTransfer(chain, wallet, transfer.amountMicro, {
          minNonce: highest === null ? 0n : highest + 1n,
        });
      },
    );
  } catch (err) {
    // Falha antes do commit (RPC fora, estimativa de gas): nada reservado, nada enviado.
    console.error("assinatura MB→wallet falhou", err);
    throw new HttpError(503, "servico_indisponivel");
  }
  if (!result.ok)
    throw new HttpError(result.reason === "saldo_insuficiente" ? 422 : 409, result.reason);

  if (result.created) {
    // Depois do commit. Se falhar aqui, advance() retransmite o rawTx gravado.
    await broadcast(chain, result.transfer.rawTx as Hex).catch((err) =>
      console.error("broadcast MB→wallet falhou; será retransmitido", err),
    );
  }
  return result.transfer;
}

/** GET /api/transfers/:id — avança o estado e devolve a transferência. */
export function handleGetTransfer(req: Request, deps: AppDeps, id: string): Promise<Response> {
  return respond(async () => {
    const { account } = await requireAccount(req, deps);
    const [t] = await deps.db
      .select()
      .from(transfers)
      .where(and(eq(transfers.id, id), eq(transfers.accountId, account.id)));
    if (!t) throw new HttpError(404, "nao_encontrada");
    if (t.status !== "PROCESSANDO") return view(t);
    const confirmations = await advance(deps, await deps.chain(), t);
    const [fresh] = await deps.db.select().from(transfers).where(eq(transfers.id, id));
    return view(fresh, confirmations);
  });
}

/**
 * Leva uma transferência PROCESSANDO ao próximo estado conforme a rede. Idempotente:
 * as transições do ledger só acontecem uma vez. Devolve as confirmações vistas.
 */
export async function advance(
  deps: AppDeps,
  chain: ChainCtx,
  t: Transfer,
): Promise<bigint | undefined> {
  if (t.direction === "MB_TO_WALLET") return advanceOutbound(deps, chain, t);
  const [account] = await deps.db.select().from(accounts).where(eq(accounts.id, t.accountId));
  return creditInbound(deps, chain, account, t.txHash as Hex, t.expiresAt);
}

/**
 * Única função que credita wallet → MB (SPEC.md › Fluxo wallet → MB). Chamada pelo
 * aviso do cliente (via advance) e pela varredura de logs. O valor creditado vem do
 * evento Transfer do recibo, nunca do cliente; o UNIQUE de tx_hash impede crédito duplo.
 */
export async function creditInbound(
  deps: AppDeps,
  chain: ChainCtx,
  account: Pick<Account, "id" | "walletAddress">,
  txHash: Hex,
  expiresAt?: Date | null,
): Promise<bigint | undefined> {
  const status = await getTxStatus(chain, txHash);
  if (status.kind === "unknown") {
    if (expiresAt && expiresAt < new Date()) {
      await failInbound(deps.db, txHash, INBOUND_NOT_FOUND);
    }
    return undefined;
  }
  if (status.kind === "pending") return 0n;
  if (status.confirmations < deps.config.confirmations) return status.confirmations;

  if (!status.success) {
    await failInbound(deps.db, txHash, "transacao_revertida");
    return status.confirmations;
  }
  const amountMicro = inboundAmountFromLogs(
    chain,
    status.logs,
    getAddress(account.walletAddress as Address),
  );
  if (amountMicro === 0n) await failInbound(deps.db, txHash, "transferencia_invalida");
  else await confirmInbound(deps.db, { accountId: account.id, txHash, amountMicro });
  return status.confirmations;
}

async function advanceOutbound(deps: AppDeps, chain: ChainCtx, t: Transfer) {
  const hash = t.txHash as Hex;
  const expired = t.expiresAt !== null && t.expiresAt < new Date();
  let status = await getTxStatus(chain, hash);

  if (status.kind !== "mined" && t.nonce !== null && (await isNonceConsumed(chain, t.nonce))) {
    // Outro tx (um cancelamento ou um substituto) usou o nonce. Reconfere: se o
    // consumidor fomos nós, agora há recibo; senão o nosso nunca vai minerar.
    status = await getTxStatus(chain, hash);
    if (status.kind !== "mined") {
      await refundOutbound(deps.db, t.id, expired ? "transacao_expirada" : "transacao_substituida");
      return undefined;
    }
  }

  if (status.kind !== "mined") {
    if (expired && t.nonce !== null) {
      // Janela de observação vencida: tenta tirar o tx de circulação antes de estornar.
      await sendCancel(chain, t.nonce, t.rawTx as Hex);
    } else if (status.kind === "unknown") {
      await broadcast(chain, t.rawTx as Hex);
    }
    return status.kind === "pending" ? 0n : undefined;
  }

  if (status.confirmations >= deps.config.confirmations) {
    if (status.success) await settleOutbound(deps.db, t.id);
    else await refundOutbound(deps.db, t.id, "transacao_revertida");
  }
  return status.confirmations;
}

/** Janelas lidas por chamada: limita a latência do painel; o marcador guarda o progresso. */
const MAX_SCAN_CHUNKS = 20;

/**
 * Recuperação: lê os Transfer(carteira → Conta MB) desde `last_scanned_block` até o
 * último bloco já com CONFIRMATIONS confirmações e credita cada hash via creditInbound.
 * Cobre quem fechou a aba entre enviar e avisar. Revarrer é seguro (hash único).
 */
export async function scanInbound(
  deps: AppDeps,
  chain: ChainCtx,
  account: Account,
): Promise<boolean> {
  if (!account.walletAddress || account.lastScannedBlock === null) return true;
  const wallet = getAddress(account.walletAddress);
  const chunk = deps.config.scanChunkBlocks;
  const latest = await chain.publicClient.getBlockNumber({ cacheTime: 0 });
  const safeTo = latest - deps.config.confirmations + 1n;

  let from = account.lastScannedBlock;
  for (let i = 0; i < MAX_SCAN_CHUNKS && from <= safeTo; i++) {
    const to = from + chunk - 1n < safeTo ? from + chunk - 1n : safeTo;
    for (const { txHash } of await findInboundTransfers(chain, wallet, from, to, chunk)) {
      await creditInbound(deps, chain, account, txHash);
    }
    from = to + 1n;
    await deps.db
      .update(accounts)
      .set({ lastScannedBlock: sql`GREATEST(${accounts.lastScannedBlock}, ${from})` })
      .where(eq(accounts.id, account.id));
  }
  return from > safeTo; // alcançou o topo? (senão, a próxima chamada continua daqui)
}
