/**
 * Ledger custodial (SPEC.md › Fluxos). Cada operação é atômica e condicionada ao
 * estado atual no próprio UPDATE, então chamadas repetidas ou concorrentes afetam o
 * saldo no máximo uma vez. As garantias finais ficam no banco (CHECK e UNIQUE).
 */
import { and, eq, sql } from "drizzle-orm";
import type { Executor, Tx } from "../db/index.ts";
import { accounts, transfers, type Account, type Transfer } from "../db/schema.ts";
import { isUniqueViolation } from "./http.ts";
import { centsToMicro, MICRO_PER_CENT, type Cents, type Micro } from "./money.ts";

/** Saldo custodial total em micro-unidades: disponível + reservado + excedente. */
export function custodialMicro(
  a: Pick<Account, "availableCents" | "reservedCents" | "excessMicro">,
): Micro {
  return (a.availableCents + a.reservedCents) * MICRO_PER_CENT + a.excessMicro;
}

/** Cria a conta de demonstração no primeiro acesso; chamadas seguintes devolvem a mesma. */
export async function createAccount(
  db: Executor,
  input: { privyUserId: string; email: string; initialCents: Cents },
): Promise<Account> {
  await db
    .insert(accounts)
    .values({
      privyUserId: input.privyUserId,
      email: input.email,
      availableCents: input.initialCents,
      initialMicro: centsToMicro(input.initialCents),
    })
    .onConflictDoNothing({ target: accounts.privyUserId });
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.privyUserId, input.privyUserId));
  return account;
}

export type SignedTx = { txHash: string; nonce: bigint; rawTx: string };

export type OutboundResult =
  { ok: true; transfer: Transfer; created: boolean } | { ok: false; reason: "saldo_insuficiente" };

/**
 * MB → wallet: reserva o valor e registra a transferência numa única transação.
 * `sign` roda dentro dessa transação (com o registro já criado), então o hash fica
 * gravado antes de qualquer broadcast. Se `sign` falhar, a reserva é desfeita.
 */
export async function createOutbound(
  db: Executor,
  input: { accountId: string; cents: Cents; clientRequestId: string; expiresAt?: Date },
  sign?: (transfer: Transfer, tx: Tx) => Promise<SignedTx>,
): Promise<OutboundResult> {
  const existing = await findByClientRequestId(db, input.clientRequestId);
  if (existing) return { ok: true, transfer: existing, created: false };

  try {
    return await db.transaction(async (tx) => {
      const reserved = await tx
        .update(accounts)
        .set({
          availableCents: sql`${accounts.availableCents} - ${input.cents}`,
          reservedCents: sql`${accounts.reservedCents} + ${input.cents}`,
        })
        .where(
          and(eq(accounts.id, input.accountId), sql`${accounts.availableCents} >= ${input.cents}`),
        )
        .returning({ id: accounts.id });
      if (reserved.length === 0) return { ok: false, reason: "saldo_insuficiente" } as const;

      let [transfer] = await tx
        .insert(transfers)
        .values({
          accountId: input.accountId,
          direction: "MB_TO_WALLET",
          amountMicro: centsToMicro(input.cents),
          clientRequestId: input.clientRequestId,
          expiresAt: input.expiresAt,
        })
        .returning();

      if (sign) {
        const signed = await sign(transfer, tx);
        [transfer] = await tx
          .update(transfers)
          .set({ ...signed, updatedAt: new Date() })
          .where(eq(transfers.id, transfer.id))
          .returning();
      }
      return { ok: true, transfer, created: true } as const;
    });
  } catch (err) {
    // Pedido duplicado concorrente: a outra transação venceu; devolve o registro dela.
    if (isUniqueViolation(err)) {
      const winner = await findByClientRequestId(db, input.clientRequestId);
      if (winner) return { ok: true, transfer: winner, created: false };
    }
    throw err;
  }
}

async function findByClientRequestId(db: Executor, clientRequestId: string) {
  const [t] = await db
    .select()
    .from(transfers)
    .where(eq(transfers.clientRequestId, clientRequestId));
  return t;
}

/** Fecha uma transferência PROCESSANDO; devolve a linha só se esta chamada fez a transição. */
async function closeTransfer(
  tx: Tx,
  where: ReturnType<typeof and>,
  set: Partial<Pick<Transfer, "status" | "failureReason" | "amountMicro">>,
) {
  const [t] = await tx
    .update(transfers)
    .set({ ...set, updatedAt: new Date() })
    .where(and(where, eq(transfers.status, "PROCESSANDO")))
    .returning();
  return t;
}

const outbound = (id: string) => and(eq(transfers.id, id), eq(transfers.direction, "MB_TO_WALLET"));

/** MB → wallet confirmado on-chain: baixa a reserva em definitivo. */
export async function settleOutbound(db: Executor, transferId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const t = await closeTransfer(tx, outbound(transferId), { status: "CONFIRMADA" });
    if (!t) return false;
    await tx
      .update(accounts)
      .set({ reservedCents: sql`${accounts.reservedCents} - ${t.amountMicro / MICRO_PER_CENT}` })
      .where(eq(accounts.id, t.accountId));
    return true;
  });
}

/** MB → wallet falhou/expirou: devolve a reserva ao disponível. */
export async function refundOutbound(
  db: Executor,
  transferId: string,
  reason: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const t = await closeTransfer(tx, outbound(transferId), {
      status: "FALHOU",
      failureReason: reason,
    });
    if (!t) return false;
    const cents = t.amountMicro / MICRO_PER_CENT;
    await tx
      .update(accounts)
      .set({
        availableCents: sql`${accounts.availableCents} + ${cents}`,
        reservedCents: sql`${accounts.reservedCents} - ${cents}`,
      })
      .where(eq(accounts.id, t.accountId));
    return true;
  });
}

/** Wallet → MB enviado: registra PROCESSANDO (sem crédito). Idempotente por hash. */
export async function recordInbound(
  db: Executor,
  input: {
    accountId: string;
    txHash: string;
    amountMicro: Micro;
    clientRequestId?: string;
    expiresAt?: Date;
  },
): Promise<Transfer | undefined> {
  await db
    .insert(transfers)
    .values({ ...input, direction: "WALLET_TO_MB" })
    .onConflictDoNothing();
  const [t] = await db.select().from(transfers).where(eq(transfers.txHash, input.txHash));
  return t;
}

/**
 * Wallet → MB confirmado on-chain: credita o valor do evento, uma vez por hash.
 * Valores com mais de 2 casas entram inteiros; a sobra abaixo de 1 centavo vai para
 * `excess_micro` e vira centavo quando acumula 10⁴.
 */
export async function confirmInbound(
  db: Executor,
  input: { accountId: string; txHash: string; amountMicro: Micro },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .insert(transfers)
      .values({ ...input, direction: "WALLET_TO_MB" })
      .onConflictDoNothing();
    const t = await closeTransfer(
      tx,
      and(
        eq(transfers.txHash, input.txHash),
        eq(transfers.accountId, input.accountId),
        eq(transfers.direction, "WALLET_TO_MB"),
      ),
      { status: "CONFIRMADA", amountMicro: input.amountMicro },
    );
    if (!t) return false;
    const cents = input.amountMicro / MICRO_PER_CENT;
    const rest = input.amountMicro % MICRO_PER_CENT;
    await tx
      .update(accounts)
      .set({
        availableCents: sql`${accounts.availableCents} + ${cents} + (${accounts.excessMicro} + ${rest}) / ${MICRO_PER_CENT}`,
        excessMicro: sql`(${accounts.excessMicro} + ${rest}) % ${MICRO_PER_CENT}`,
      })
      .where(eq(accounts.id, input.accountId));
    return true;
  });
}

/** Wallet → MB revertido on-chain: nada a creditar, só fecha o registro. */
export async function failInbound(db: Executor, txHash: string, reason: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const t = await closeTransfer(
      tx,
      and(eq(transfers.txHash, txHash), eq(transfers.direction, "WALLET_TO_MB")),
      { status: "FALHOU", failureReason: reason },
    );
    return Boolean(t);
  });
}
