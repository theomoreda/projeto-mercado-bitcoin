import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { accounts, transfers } from "../../src/db/schema.ts";
import {
  confirmInbound,
  createAccount,
  createOutbound,
  custodialMicro,
  failInbound,
  recordInbound,
  refundOutbound,
  settleOutbound,
} from "../../src/lib/ledger.ts";
import { db, resetDb } from "./db.ts";

const INITIAL = 100_000n; // 1.000,00
const hash = () => `0x${randomUUID().replaceAll("-", "").padEnd(64, "0")}`;

async function newAccount() {
  return createAccount(db, {
    privyUserId: randomUUID(),
    email: "demo@x.com",
    initialCents: INITIAL,
  });
}
const reload = async (id: string) =>
  (await db.select().from(accounts).where(eq(accounts.id, id)))[0];

/** Invariante da jornada sem on-chain: o custodial só muda pelo que saiu/entrou confirmado. */
async function expectCustodial(id: string, micro: bigint) {
  expect(custodialMicro(await reload(id))).toBe(micro);
}

beforeEach(resetDb);

describe("createAccount", () => {
  it("é idempotente por usuário Privy, mesmo em paralelo", async () => {
    const input = { privyUserId: "did:privy:1", email: "demo@x.com", initialCents: INITIAL };
    const [a, b] = await Promise.all([createAccount(db, input), createAccount(db, input)]);
    expect(a.id).toBe(b.id);
    expect(await db.select().from(accounts)).toHaveLength(1);
    expect(a.initialMicro).toBe(1_000_000_000n);
  });
});

describe("MB → wallet", () => {
  it("reserva antes do envio: disponível cai e reservado sobe", async () => {
    const acc = await newAccount();
    const r = await createOutbound(db, {
      accountId: acc.id,
      cents: 1_000n,
      clientRequestId: randomUUID(),
    });
    expect(r.ok).toBe(true);
    const after = await reload(acc.id);
    expect(after.availableCents).toBe(99_000n);
    expect(after.reservedCents).toBe(1_000n);
    await expectCustodial(acc.id, 1_000_000_000n);
  });

  it("dois envios simultâneos com saldo para um só: exatamente um passa", async () => {
    const acc = await newAccount();
    const results = await Promise.all(
      [1, 2].map(() =>
        createOutbound(db, { accountId: acc.id, cents: 60_000n, clientRequestId: randomUUID() }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "saldo_insuficiente")).toHaveLength(1);
    const after = await reload(acc.id);
    expect(after.availableCents).toBe(40_000n);
    expect(after.reservedCents).toBe(60_000n);
  });

  it("mesmo clientRequestId (duplo clique), mesmo em paralelo: um registro e uma reserva", async () => {
    const acc = await newAccount();
    const req = { accountId: acc.id, cents: 1_000n, clientRequestId: randomUUID() };
    const [a, b] = await Promise.all([createOutbound(db, req), createOutbound(db, req)]);
    expect(a.ok && b.ok && a.transfer.id === b.transfer.id).toBe(true);
    expect(await db.select().from(transfers)).toHaveLength(1);
    expect((await reload(acc.id)).availableCents).toBe(99_000n);
  });

  it("falha no passo de assinatura desfaz a reserva", async () => {
    const acc = await newAccount();
    await expect(
      createOutbound(
        db,
        { accountId: acc.id, cents: 1_000n, clientRequestId: randomUUID() },
        async () => {
          throw new Error("rpc fora do ar");
        },
      ),
    ).rejects.toThrow("rpc fora do ar");
    expect((await reload(acc.id)).availableCents).toBe(INITIAL);
    expect(await db.select().from(transfers)).toHaveLength(0);
  });

  it("grava hash, nonce e tx assinado na mesma transação da reserva", async () => {
    const acc = await newAccount();
    const txHash = hash();
    const r = await createOutbound(
      db,
      { accountId: acc.id, cents: 1_000n, clientRequestId: randomUUID() },
      async () => ({ txHash, nonce: 7n, rawTx: "0xsigned" }),
    );
    expect(r.ok && r.transfer).toMatchObject({
      txHash,
      nonce: 7n,
      rawTx: "0xsigned",
      amountMicro: 10_000_000n,
    });
  });

  it("confirmação baixa a reserva uma vez só", async () => {
    const acc = await newAccount();
    const r = await createOutbound(db, {
      accountId: acc.id,
      cents: 1_000n,
      clientRequestId: randomUUID(),
    });
    if (!r.ok) throw new Error();
    const results = await Promise.all([
      settleOutbound(db, r.transfer.id),
      settleOutbound(db, r.transfer.id),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const after = await reload(acc.id);
    expect(after.availableCents).toBe(99_000n);
    expect(after.reservedCents).toBe(0n);
    // Saiu 10,00 da custódia (foi para a wallet).
    await expectCustodial(acc.id, 1_000_000_000n - 10_000_000n);
  });

  it("estorno devolve exatamente uma vez e marca FALHOU", async () => {
    const acc = await newAccount();
    const r = await createOutbound(db, {
      accountId: acc.id,
      cents: 1_000n,
      clientRequestId: randomUUID(),
    });
    if (!r.ok) throw new Error();
    const results = await Promise.all([
      refundOutbound(db, r.transfer.id, "revertida"),
      refundOutbound(db, r.transfer.id, "revertida"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const after = await reload(acc.id);
    expect(after.availableCents).toBe(INITIAL);
    expect(after.reservedCents).toBe(0n);
    const [t] = await db.select().from(transfers);
    expect(t).toMatchObject({ status: "FALHOU", failureReason: "revertida" });
  });

  it("não estorna o que já foi confirmado (nem confirma o que foi estornado)", async () => {
    const acc = await newAccount();
    const r = await createOutbound(db, {
      accountId: acc.id,
      cents: 1_000n,
      clientRequestId: randomUUID(),
    });
    if (!r.ok) throw new Error();
    expect(await settleOutbound(db, r.transfer.id)).toBe(true);
    expect(await refundOutbound(db, r.transfer.id, "tarde demais")).toBe(false);
    expect((await reload(acc.id)).availableCents).toBe(99_000n);
  });
});

describe("wallet → MB", () => {
  it("só credita na confirmação, e cada hash uma vez só", async () => {
    const acc = await newAccount();
    const txHash = hash();
    await recordInbound(db, {
      accountId: acc.id,
      txHash,
      amountMicro: 5_000_000n,
      clientRequestId: randomUUID(),
    });
    expect((await reload(acc.id)).availableCents).toBe(INITIAL); // sem crédito otimista

    const results = await Promise.all([
      confirmInbound(db, { accountId: acc.id, txHash, amountMicro: 5_000_000n }),
      confirmInbound(db, { accountId: acc.id, txHash, amountMicro: 5_000_000n }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await confirmInbound(db, { accountId: acc.id, txHash, amountMicro: 5_000_000n })).toBe(
      false,
    );
    expect((await reload(acc.id)).availableCents).toBe(INITIAL + 500n);
    expect(await db.select().from(transfers)).toHaveLength(1);
  });

  it("confirma mesmo sem aviso prévio do cliente (varredura), sem duplicar", async () => {
    const acc = await newAccount();
    const txHash = hash();
    expect(await confirmInbound(db, { accountId: acc.id, txHash, amountMicro: 1_000_000n })).toBe(
      true,
    );
    await recordInbound(db, {
      accountId: acc.id,
      txHash,
      amountMicro: 1_000_000n,
      clientRequestId: randomUUID(),
    });
    expect(await db.select().from(transfers)).toHaveLength(1);
    expect((await reload(acc.id)).availableCents).toBe(INITIAL + 100n);
  });

  it("valor com 6 casas entra inteiro, com excedente separado e carry de centavo", async () => {
    const acc = await newAccount();
    await confirmInbound(db, { accountId: acc.id, txHash: hash(), amountMicro: 1_234_567n });
    let a = await reload(acc.id);
    expect([a.availableCents, a.excessMicro]).toEqual([INITIAL + 123n, 4_567n]);

    await confirmInbound(db, { accountId: acc.id, txHash: hash(), amountMicro: 5_433n + 10_000n });
    a = await reload(acc.id);
    expect([a.availableCents, a.excessMicro]).toEqual([INITIAL + 125n, 0n]);
    await expectCustodial(acc.id, 1_000_000_000n + 1_234_567n + 15_433n);
  });

  it("falha on-chain marca FALHOU sem mexer no saldo", async () => {
    const acc = await newAccount();
    const txHash = hash();
    await recordInbound(db, {
      accountId: acc.id,
      txHash,
      amountMicro: 1_000_000n,
      clientRequestId: randomUUID(),
    });
    expect(await failInbound(db, txHash, "revertida")).toBe(true);
    expect(await confirmInbound(db, { accountId: acc.id, txHash, amountMicro: 1_000_000n })).toBe(
      false,
    );
    expect((await reload(acc.id)).availableCents).toBe(INITIAL);
  });
});
