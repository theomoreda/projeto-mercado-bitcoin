/**
 * Reconciliação (SPEC.md › Reconciliação, RNF-04), em micro-unidades:
 *   por conta:   custodial + carteira + entradas_em_trânsito − saídas_em_trânsito = inicial
 *   tesouraria:  saldo on-chain = Σ custodial + entradas_em_trânsito − saídas_em_trânsito
 * "Em trânsito" = já minerado, ainda sem CONFIRMATIONS: entrada que saiu da carteira e
 * ainda não foi creditada; saída que já chegou à carteira e ainda está reservada.
 */
import { and, eq } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { accounts, transfers, type Account } from "../db/schema.ts";
import { findInboundTransfers, getTxStatus, tokenBalance, type ChainCtx } from "./chain.ts";
import type { AppDeps } from "./deps.ts";
import { custodialMicro } from "./ledger.ts";
import { advance, scanInbound } from "./transfers.ts";

export type AccountRecon = {
  email: string;
  initialMicro: bigint;
  custodialMicro: bigint;
  walletMicro: bigint;
  inTransitMicro: bigint;
  diffMicro: bigint;
};

export type TreasuryRecon = {
  address: Address;
  onchainMicro: bigint;
  expectedMicro: bigint;
  diffMicro: bigint;
};

export type Reconciliation = {
  ok: boolean;
  accounts: AccountRecon[];
  treasury: TreasuryRecon | null;
};

/** Reconcilia todas as contas + tesouraria, ou só uma conta (sem a tesouraria). */
export async function reconcile(deps: AppDeps, onlyAccountId?: string): Promise<Reconciliation> {
  const chain = await deps.chain();
  const load = () =>
    onlyAccountId
      ? deps.db.select().from(accounts).where(eq(accounts.id, onlyAccountId))
      : deps.db.select().from(accounts);

  // Primeiro fecha tudo que já tem confirmações suficientes; o que sobrar está em trânsito.
  for (const a of await load()) await settlePending(deps, chain, a);

  const latest = await chain.publicClient.getBlockNumber({ cacheTime: 0 });
  const result: AccountRecon[] = [];
  let custodialTotal = 0n;
  let inTransitTotal = 0n;
  for (const a of await load()) {
    const custodial = custodialMicro(a);
    const wallet = a.walletAddress ? await tokenBalance(chain, a.walletAddress as Address) : 0n;
    const inTransit =
      (await inboundInTransit(deps, chain, a, latest)) - (await outboundInTransit(deps, chain, a));
    result.push({
      email: a.email,
      initialMicro: a.initialMicro,
      custodialMicro: custodial,
      walletMicro: wallet,
      inTransitMicro: inTransit,
      diffMicro: custodial + wallet + inTransit - a.initialMicro,
    });
    custodialTotal += custodial;
    inTransitTotal += inTransit;
  }

  let treasury: TreasuryRecon | null = null;
  if (!onlyAccountId) {
    const onchain = await tokenBalance(chain, chain.treasury.address);
    const expected = custodialTotal + inTransitTotal;
    treasury = {
      address: chain.treasury.address,
      onchainMicro: onchain,
      expectedMicro: expected,
      diffMicro: onchain - expected,
    };
  }
  const ok = result.every((r) => r.diffMicro === 0n) && (treasury?.diffMicro ?? 0n) === 0n;
  return { ok, accounts: result, treasury };
}

async function settlePending(deps: AppDeps, chain: ChainCtx, a: Account) {
  // Varre até alcançar o topo: a cada chamada a varredura lê no máximo 20 janelas.
  let current = a;
  while (!(await scanInbound(deps, chain, current))) {
    [current] = await deps.db.select().from(accounts).where(eq(accounts.id, a.id));
  }
  const pending = await deps.db
    .select()
    .from(transfers)
    .where(and(eq(transfers.accountId, a.id), eq(transfers.status, "PROCESSANDO")));
  for (const t of pending) await advance(deps, chain, t);
}

/** Entradas mineradas depois do último bloco já varrido (ainda sem confirmações). */
async function inboundInTransit(deps: AppDeps, chain: ChainCtx, a: Account, latest: bigint) {
  if (!a.walletAddress || a.lastScannedBlock === null || a.lastScannedBlock > latest) return 0n;
  const found = await findInboundTransfers(
    chain,
    a.walletAddress as Address,
    a.lastScannedBlock,
    latest,
    deps.config.scanChunkBlocks,
  );
  let sum = 0n;
  for (const { txHash, amountMicro } of found) {
    const [t] = await deps.db.select().from(transfers).where(eq(transfers.txHash, txHash));
    if (t?.status !== "CONFIRMADA") sum += amountMicro;
  }
  return sum;
}

/** Saídas já mineradas com sucesso mas ainda reservadas (sem confirmações suficientes). */
async function outboundInTransit(deps: AppDeps, chain: ChainCtx, a: Account) {
  const pending = await deps.db
    .select()
    .from(transfers)
    .where(
      and(
        eq(transfers.accountId, a.id),
        eq(transfers.direction, "MB_TO_WALLET"),
        eq(transfers.status, "PROCESSANDO"),
      ),
    );
  let sum = 0n;
  for (const t of pending) {
    const status = await getTxStatus(chain, t.txHash as Hex);
    if (status.kind === "mined" && status.success) sum += t.amountMicro;
  }
  return sum;
}
