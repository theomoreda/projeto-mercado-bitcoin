import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, transfers } from "../../src/db/schema.ts";
import { tokenBalance } from "../../src/lib/chain.ts";
import { custodialMicro } from "../../src/lib/ledger.ts";
import { handleMe } from "../../src/lib/me.ts";
import { handleCreateTransfer, handleGetTransfer } from "../../src/lib/transfers.ts";
import { handleActivateWallet } from "../../src/lib/wallet.ts";
import { KEYS, startChain, type TestChain } from "./anvil.ts";
import { db, resetDb } from "./db.ts";
import { makeDeps, req } from "./deps.ts";

let c: TestChain;
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const deps = () => makeDeps({ demo: { email: "demo@x.com", wallet: WALLET } }, c.ctx);

/** Envia Mock USDC da wallet do usuário (como faria a carteira embutida no navegador). */
async function walletSend(to: Address, amount: bigint, opts: { gas?: bigint; key?: Hex } = {}) {
  const signer = opts.key
    ? createWalletClient({
        account: privateKeyToAccount(opts.key),
        chain: foundry,
        transport: http(c.rpcUrl),
      })
    : c.user;
  return signer.writeContract({
    address: c.token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
    gas: opts.gas,
  });
}
const notify = (txHash: string, clientRequestId: string = randomUUID()) =>
  handleCreateTransfer(
    req("/api/transfers", "tok-demo", {
      direction: "WALLET_TO_MB",
      txHash,
      amount: "0",
      clientRequestId,
    }),
    deps(),
  );
const status = async (id: string) =>
  (await handleGetTransfer(req(`/api/transfers/${id}`, "tok-demo"), deps(), id)).json();
const account = async () => (await db.select().from(accounts))[0];
const me = async () => (await handleMe(req("/api/me", "tok-demo"), deps())).json();

let totalMicro: bigint; // custodial + wallet no início de cada teste

beforeAll(async () => {
  c = await startChain(8551);
});
afterAll(() => c?.stop());
beforeEach(async () => {
  await resetDb();
  await c.testClient.setAutomine(true);
  await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
  await c.mint(WALLET, 10_000_000n);
  totalMicro = custodialMicro(await account()) + (await tokenBalance(c.ctx, WALLET));
});

async function expectInvariant() {
  expect(custodialMicro(await account()) + (await tokenBalance(c.ctx, WALLET))).toBe(totalMicro);
}

describe("POST /api/transfers WALLET_TO_MB", () => {
  it("registra PROCESSANDO e só credita após CONFIRMATIONS blocos, uma vez só", async () => {
    const hash = await walletSend(c.ctx.treasury.address, 5_000_000n);
    const res = await notify(hash);
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t).toMatchObject({
      direction: "WALLET_TO_MB",
      status: "PROCESSANDO",
      amountMicro: "5000000",
    });
    const before = (await account()).availableCents;

    expect(await status(t.id)).toMatchObject({ status: "PROCESSANDO" }); // 1 confirmação
    expect((await account()).availableCents).toBe(before); // sem crédito otimista

    await c.mine(1);
    expect(await status(t.id)).toMatchObject({ status: "CONFIRMADA" });
    expect(await status(t.id)).toMatchObject({ status: "CONFIRMADA" });
    expect((await (await notify(hash)).json()).id).toBe(t.id); // mesmo hash de novo
    expect((await account()).availableCents).toBe(before + 500n);
    expect(await db.select().from(transfers)).toHaveLength(1);
    await expectInvariant();
  });

  it("valor com 6 casas entra inteiro (excedente separado) e a invariante fecha", async () => {
    const hash = await walletSend(c.ctx.treasury.address, 1_234_567n);
    const t = await (await notify(hash)).json();
    await c.mine(1);
    expect(await status(t.id)).toMatchObject({ status: "CONFIRMADA", amountMicro: "1234567" });
    expect((await account()).excessMicro).toBe(4_567n);
    await expectInvariant();
  });

  it("tx revertido → FALHOU sem crédito", async () => {
    const hash = await walletSend(c.ctx.treasury.address, 999_000_000n, { gas: 100_000n });
    const t = await (await notify(hash)).json();
    await c.mine(1);
    expect(await status(t.id)).toMatchObject({
      status: "FALHOU",
      failureReason: "transacao_revertida",
    });
    await expectInvariant();
  });

  it("hash de tx de outra carteira não é aceito (nem bloqueia o dono legítimo)", async () => {
    await c.mint(privateKeyToAccount(KEYS.other).address, 1_000_000n);
    const hash = await walletSend(c.ctx.treasury.address, 1_000_000n, { key: KEYS.other });
    const res = await notify(hash);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "transacao_invalida" });
    expect(await db.select().from(transfers)).toHaveLength(0);
  });

  it("tx para outro destino que não a Conta MB não é aceito", async () => {
    const hash = await walletSend("0x000000000000000000000000000000000000dEaD", 1_000_000n);
    expect((await notify(hash)).status).toBe(422);
  });

  it("hash malformado → 400", async () => {
    expect((await notify("0x1234")).status).toBe(400);
  });

  it("expirou como FALHOU sem recibo e o tx minera depois → credita uma vez só", async () => {
    await c.testClient.setAutomine(false);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [c.ctx.treasury.address, 2_000_000n],
    });
    const raw = await c.user.signTransaction(
      await c.user.prepareTransactionRequest({ to: c.token, data }),
    );
    const hash = await c.pub.sendRawTransaction({ serializedTransaction: raw });
    const t = await (await notify(hash)).json();
    const before = (await account()).availableCents;

    // O nó perde o tx e a janela de observação vence: o app fecha como FALHOU.
    await c.testClient.dropTransaction({ hash });
    await db
      .update(transfers)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(transfers.id, t.id));
    expect(await status(t.id)).toMatchObject({
      status: "FALHOU",
      failureReason: "transacao_nao_encontrada",
    });
    expect((await account()).availableCents).toBe(before);

    // O mesmo tx minera depois (nó atrasado): a varredura do painel reabre e credita.
    await c.pub.sendRawTransaction({ serializedTransaction: raw });
    await c.mine(2);
    await me();
    expect((await account()).availableCents).toBe(before + 200n);
    const [row] = await db.select().from(transfers);
    expect(row).toMatchObject({ txHash: hash, status: "CONFIRMADA", failureReason: null });

    await me();
    await me();
    expect((await account()).availableCents).toBe(before + 200n);
    expect(await db.select().from(transfers)).toHaveLength(1);
    await expectInvariant();
  });
});
