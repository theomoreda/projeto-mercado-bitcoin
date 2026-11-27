import { erc20Abi, TransactionNotFoundError, TransactionReceiptNotFoundError } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, transfers } from "../../src/db/schema.ts";
import type { ChainCtx } from "../../src/lib/chain.ts";
import { handleMe } from "../../src/lib/me.ts";
import { handleCreateTransfer } from "../../src/lib/transfers.ts";
import { handleActivateWallet } from "../../src/lib/wallet.ts";
import { startChain, type TestChain } from "./anvil.ts";
import { db, resetDb } from "./db.ts";
import { makeDeps, req } from "./deps.ts";

let c: TestChain;
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
let chunk = 500n;
const deps = () => {
  const d = makeDeps({ demo: { email: "demo@x.com", wallet: WALLET } }, c.ctx);
  return { ...d, config: { ...d.config, scanChunkBlocks: chunk } };
};
const me = async () => (await handleMe(req("/api/me", "tok-demo"), deps())).json();

/** Nó atrasado: ainda não conhece o tx nem o recibo (os logs, sim, já aparecem). */
const laggingChain = (ctx: ChainCtx): ChainCtx => ({
  ...ctx,
  publicClient: new Proxy(ctx.publicClient, {
    get(target, prop, receiver) {
      if (prop === "getTransactionReceipt") {
        return async ({ hash }: { hash: `0x${string}` }) => {
          throw new TransactionReceiptNotFoundError({ hash });
        };
      }
      if (prop === "getTransaction") {
        return async ({ hash }: { hash: `0x${string}` }) => {
          throw new TransactionNotFoundError({ hash });
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }),
});
const meLagging = async () =>
  (
    await handleMe(req("/api/me", "tok-demo"), {
      ...deps(),
      chain: async () => laggingChain(c.ctx),
    })
  ).json();
const account = async () => (await db.select().from(accounts))[0];
const sendToMb = async (amount: bigint) => {
  const hash = await c.user.writeContract({
    address: c.token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [c.ctx.treasury.address, amount],
  });
  await c.pub.waitForTransactionReceipt({ hash });
  return hash;
};

beforeAll(async () => {
  c = await startChain(8552);
});
afterAll(() => c?.stop());
beforeEach(async () => {
  chunk = 500n;
  await resetDb();
  await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
  await c.mint(WALLET, 10_000_000n);
});

describe("varredura de entradas no GET /api/me", () => {
  it("credita um envio que o cliente nunca avisou, só depois das confirmações", async () => {
    const hash = await sendToMb(2_000_000n);
    expect((await me()).account.availableCents).toBe("100000"); // 1 confirmação
    await c.mine(1);
    expect((await me()).account.availableCents).toBe("100200");
    const [t] = await db.select().from(transfers);
    expect(t).toMatchObject({ txHash: hash, direction: "WALLET_TO_MB", status: "CONFIRMADA" });
  });

  it("revarrer os mesmos blocos (inclusive voltando o marcador) não credita em dobro", async () => {
    const start = (await account()).lastScannedBlock;
    await sendToMb(1_000_000n);
    await c.mine(1);
    await me();
    await db.update(accounts).set({ lastScannedBlock: start });
    await me();
    await me();
    expect((await account()).availableCents).toBe(100_100n);
    expect(await db.select().from(transfers)).toHaveLength(1);
  });

  it("aviso do cliente + varredura → um crédito só", async () => {
    const hash = await sendToMb(1_000_000n);
    await handleCreateTransfer(
      req("/api/transfers", "tok-demo", {
        direction: "WALLET_TO_MB",
        txHash: hash,
        clientRequestId: "req-12345678",
      }),
      deps(),
    );
    await c.mine(1);
    await me();
    expect((await account()).availableCents).toBe(100_100n);
    expect(await db.select().from(transfers)).toHaveLength(1);
  });

  it("recibo ainda indisponível (nó atrasado) não faz a varredura pular o depósito", async () => {
    const start = (await account()).lastScannedBlock;
    const hash = await sendToMb(2_000_000n);
    await c.mine(1);

    // Primeira passada: os logs aparecem, mas o nó não tem o recibo.
    await meLagging();
    expect((await account()).availableCents).toBe(100_000n);
    expect((await account()).lastScannedBlock).toBe(start); // marcador não passou do tx

    // Próxima passada, com o nó em dia: credita uma vez só.
    await me();
    expect((await account()).availableCents).toBe(100_200n);
    const [t] = await db.select().from(transfers);
    expect(t).toMatchObject({ txHash: hash, direction: "WALLET_TO_MB", status: "CONFIRMADA" });
    await me();
    expect((await account()).availableCents).toBe(100_200n);
    expect(await db.select().from(transfers)).toHaveLength(1);
  });

  it("percorre várias janelas pequenas e avança o marcador", async () => {
    chunk = 5n;
    await c.mine(23);
    await sendToMb(3_000_000n);
    await c.mine(1);
    expect((await me()).account.availableCents).toBe("100300");
    const latest = await c.pub.getBlockNumber({ cacheTime: 0 });
    expect((await account()).lastScannedBlock).toBe(latest); // próximo bloco a ler = latest − N + 2
  });
});
