/**
 * Orquestra ledger + cadeia para as transferências (SPEC.md › Fluxos). A confirmação é
 * "preguiçosa": `advance()` roda quando a tela consulta o status, sem worker.
 */
import { and, eq, max, sql } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { transfers, type Account, type Transfer } from "../db/schema.ts";
import {
  broadcast,
  getTxStatus,
  isNonceConsumed,
  signTreasuryTransfer,
  type ChainCtx,
} from "./chain.ts";
import type { AppDeps } from "./deps.ts";
import { HttpError, respond } from "./http.ts";
import { createOutbound, refundOutbound, settleOutbound } from "./ledger.ts";
import { requireAccount } from "./me.ts";
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

type CreateBody = { direction?: unknown; amount?: unknown; clientRequestId?: unknown };

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
    throw new HttpError(400, "pedido_invalido");
  });
}

async function startOutbound(
  deps: AppDeps,
  account: Account,
  amount: string,
  clientRequestId: string,
) {
  const wallet = account.walletAddress as Address | null;
  if (!wallet) throw new HttpError(409, "carteira_nao_ativada");
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
  if (!result.ok) throw new HttpError(422, result.reason);

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
  return undefined;
}

async function advanceOutbound(deps: AppDeps, chain: ChainCtx, t: Transfer) {
  const hash = t.txHash as Hex;
  let status = await getTxStatus(chain, hash);

  if (status.kind === "unknown" && t.nonce !== null && (await isNonceConsumed(chain, t.nonce))) {
    // Outro tx usou o nonce. Reconfere: se o consumidor fomos nós, agora há recibo.
    status = await getTxStatus(chain, hash);
    if (status.kind === "unknown") {
      await refundOutbound(deps.db, t.id, "transacao_substituida");
      return undefined;
    }
  }

  if (status.kind === "unknown") {
    await broadcast(chain, t.rawTx as Hex);
    return undefined;
  }
  if (status.kind === "pending") return 0n;

  if (status.confirmations >= deps.config.confirmations) {
    if (status.success) await settleOutbound(deps.db, t.id);
    else await refundOutbound(deps.db, t.id, "transacao_revertida");
  }
  return status.confirmations;
}
