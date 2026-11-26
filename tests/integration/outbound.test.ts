import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, transfers } from "../../src/db/schema.ts";
import { tokenBalance } from "../../src/lib/chain.ts";
import { custodialMicro } from "../../src/lib/ledger.ts";
import { handleCreateTransfer, handleGetTransfer } from "../../src/lib/transfers.ts";
import { handleActivateWallet } from "../../src/lib/wallet.ts";
import { startChain, type TestChain } from "./anvil.ts";
import { db, resetDb } from "./db.ts";
import { makeDeps, req } from "./deps.ts";

let c: TestChain;
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const INITIAL_MICRO = 1_000_000_000n;
const deps = () => makeDeps({ demo: { email: "demo@x.com", wallet: WALLET } }, c.ctx);

const send = (amount: string, clientRequestId: string = randomUUID()) =>
  handleCreateTransfer(
    req("/api/transfers", "tok-demo", { direction: "MB_TO_WALLET", amount, clientRequestId }),
    deps(),
  );
const status = async (id: string) =>
  (await handleGetTransfer(req(`/api/transfers/${id}`, "tok-demo"), deps(), id)).json();
const account = async () => (await db.select().from(accounts))[0];

/** Invariante da jornada: custodial + saldo da wallet = saldo inicial. */
async function expectInvariant() {
  const onchain = await tokenBalance(c.ctx, WALLET);
  expect(custodialMicro(await account()) + onchain).toBe(INITIAL_MICRO);
}

/** Zera o saldo de Mock USDC da tesouraria direto no storage (força revert de um tx já assinado). */
async function drainTreasury() {
  const slot = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [c.ctx.treasury.address, 0n]),
  );
  await c.testClient.setStorageAt({
    address: c.token,
    index: slot,
    value: `0x${"0".repeat(64)}` as Hex,
  });
}

beforeAll(async () => {
  c = await startChain(8550);
});
afterAll(() => c?.stop());
beforeEach(async () => {
  await resetDb();
  await c.testClient.setAutomine(true);
  // Wallet zerada e tesouraria com lastro exato a cada teste.
  const userBalance = await tokenBalance(c.ctx, WALLET);
  if (userBalance > 0n) {
    const hash = await c.user.writeContract({
      address: c.token,
      abi: [
        {
          type: "function",
          name: "transfer",
          stateMutability: "nonpayable",
          inputs: [{ type: "address" }, { type: "uint256" }],
          outputs: [{ type: "bool" }],
        },
      ],
      functionName: "transfer",
      args: ["0x000000000000000000000000000000000000dEaD", userBalance],
    });
    await c.pub.waitForTransactionReceipt({ hash });
  }
  await drainTreasury();
  await c.mint(c.ctx.treasury.address, INITIAL_MICRO);
  await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
});

describe("POST /api/transfers MB_TO_WALLET", () => {
  it("reserva, envia e só confirma após CONFIRMATIONS blocos", async () => {
    const res = await send("10,50");
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t).toMatchObject({
      direction: "MB_TO_WALLET",
      status: "PROCESSANDO",
      amountMicro: "10500000",
    });
    expect(t.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await account()).reservedCents).toBe(1_050n);

    // Automine: 1 confirmação. CONFIRMATIONS = 2 → ainda processando.
    expect(await status(t.id)).toMatchObject({ status: "PROCESSANDO" });
    await c.mine(1);
    expect(await status(t.id)).toMatchObject({ status: "CONFIRMADA" });

    const a = await account();
    expect([a.availableCents, a.reservedCents]).toEqual([100_000n - 1_050n, 0n]);
    expect(await tokenBalance(c.ctx, WALLET)).toBe(10_500_000n);
    await expectInvariant();
  });

  it("tx revertido → FALHOU com estorno único", async () => {
    await c.testClient.setAutomine(false);
    const t = await (await send("5")).json();
    await drainTreasury(); // tesouraria sem saldo quando o tx minerar
    await c.mine(2);
    expect(await status(t.id)).toMatchObject({
      status: "FALHOU",
      failureReason: "transacao_revertida",
    });
    expect(await status(t.id)).toMatchObject({ status: "FALHOU" });
    const a = await account();
    expect([a.availableCents, a.reservedCents]).toEqual([100_000n, 0n]);
  });

  it("tx descartado do mempool é retransmitido e confirma", async () => {
    await c.testClient.setAutomine(false);
    const t = await (await send("1")).json();
    await c.testClient.dropTransaction({ hash: t.txHash });
    expect(await status(t.id)).toMatchObject({ status: "PROCESSANDO" }); // retransmite
    await c.mine(2);
    expect(await status(t.id)).toMatchObject({ status: "CONFIRMADA" });
    await expectInvariant();
  });

  it("tx descartado cujo nonce foi usado por outro → nunca vai minerar → estorno", async () => {
    await c.testClient.setAutomine(false);
    const a = await (await send("1")).json();
    await c.testClient.dropTransaction({ hash: a.txHash });
    await db.update(transfers).set({ status: "FALHOU" }).where(eq(transfers.id, a.id)); // tira A do cálculo de nonce
    const b = await (await send("2")).json(); // B reutiliza o nonce de A
    await db.update(transfers).set({ status: "PROCESSANDO" }).where(eq(transfers.id, a.id));
    expect(b.txHash).not.toBe(a.txHash);
    await c.mine(2);
    expect(await status(a.id)).toMatchObject({
      status: "FALHOU",
      failureReason: "transacao_substituida",
    });
    expect(await status(b.id)).toMatchObject({ status: "CONFIRMADA" });
    await expectInvariant();
  });

  it("nonce já reservado no banco (assinado, ainda não transmitido) não é reutilizado", async () => {
    await c.testClient.setAutomine(false);
    const pending = BigInt(
      await c.pub.getTransactionCount({ address: c.ctx.treasury.address, blockTag: "pending" }),
    );
    // Simula A: commitado com o nonce `pending`, mas o broadcast ainda não aconteceu.
    await db.insert(transfers).values({
      accountId: (await account()).id,
      direction: "MB_TO_WALLET",
      amountMicro: 0n,
      txHash: `0x${"ab".repeat(32)}`,
      nonce: pending,
    });
    const b = await (await send("1")).json();
    const [row] = await db.select().from(transfers).where(eq(transfers.id, b.id));
    expect(row.nonce).toBe(pending + 1n);
  });

  it("mesmo clientRequestId → uma transferência e um tx", async () => {
    const id = randomUUID();
    const [a, b] = await Promise.all([send("3", id), send("3", id)]);
    expect((await a.json()).id).toBe((await b.json()).id);
    expect(await db.select().from(transfers)).toHaveLength(1);
    expect((await account()).availableCents).toBe(100_000n - 300n);
  });

  it.each([
    ["0", "zero_ou_negativo"],
    ["abc", "invalido"],
    ["1000,01", "saldo_insuficiente"],
  ])("valor %j → 422 %s, sem reserva", async (amount, reason) => {
    const res = await send(amount);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: reason });
    expect((await account()).availableCents).toBe(100_000n);
  });

  it("trunca 3+ casas antes de enviar", async () => {
    expect(await (await send("0,019")).json()).toMatchObject({ amountMicro: "10000" });
  });

  it("rede indisponível na assinatura → 503 e reserva desfeita", async () => {
    await drainTreasury(); // estimativa de gas falha: a tesouraria não tem saldo
    const res = await send("1");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "servico_indisponivel" });
    expect((await account()).availableCents).toBe(100_000n);
    expect(await db.select().from(transfers)).toHaveLength(0);
  });

  it("transferência de outra conta → 404", async () => {
    const t = await (await send("1")).json();
    const other = makeDeps({ intruder: { email: "i@x.com" } }, c.ctx);
    const res = await handleGetTransfer(req(`/api/transfers/${t.id}`, "tok-intruder"), other, t.id);
    expect(res.status).toBe(404);
  });
});
