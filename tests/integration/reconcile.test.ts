import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { erc20Abi } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accounts } from "../../src/db/schema.ts";
import { reconcile } from "../../src/lib/reconcile.ts";
import { handleCreateTransfer, handleGetTransfer } from "../../src/lib/transfers.ts";
import { handleActivateWallet } from "../../src/lib/wallet.ts";
import { KEYS, startChain, type TestChain } from "./anvil.ts";
import { db, resetDb } from "./db.ts";
import { makeDeps, req } from "./deps.ts";

let c: TestChain;
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const deps = () => makeDeps({ demo: { email: "demo@x.com", wallet: WALLET } }, c.ctx);

const toWallet = async (amount: string) => {
  const res = await handleCreateTransfer(
    req("/api/transfers", "tok-demo", {
      direction: "MB_TO_WALLET",
      amount,
      clientRequestId: randomUUID(),
    }),
    deps(),
  );
  return (await res.json()).id as string;
};
const toMb = async (amount: bigint) => {
  const hash = await c.user.writeContract({
    address: c.token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [c.ctx.treasury.address, amount],
  });
  await c.pub.waitForTransactionReceipt({ hash });
  return hash;
};
const poll = (id: string) => handleGetTransfer(req(`/api/transfers/${id}`, "tok-demo"), deps(), id);

beforeAll(async () => {
  c = await startChain(8554);
});
afterAll(() => c?.stop());
beforeEach(async () => {
  await resetDb();
  await c.testClient.setAutomine(true);
  await c.setTokenBalance(WALLET, 0n);
  await c.setTokenBalance(c.ctx.treasury.address, 1_000_000_000n); // lastro exato de 1 conta demo
  await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
});

describe("reconcile", () => {
  it("ida e volta concluídas: tudo fecha em zero", async () => {
    await poll(await toWallet("100"));
    await c.mine(1);
    await poll((await db.query.transfers.findFirst())!.id);
    await toMb(40_123_456n); // 6 casas: excedente precisa fechar sem resíduo
    await c.mine(1);

    const r = await reconcile(deps());
    expect(r.ok).toBe(true);
    expect(r.accounts[0]).toMatchObject({ diffMicro: 0n, inTransitMicro: 0n });
    expect(r.treasury?.diffMicro).toBe(0n);
    expect((await db.select().from(accounts))[0].availableCents).toBe(100_000n - 10_000n + 4_012n);
  });

  it("valores em trânsito (minerados, ainda sem confirmações) não contam como diferença", async () => {
    await poll(await toWallet("20")); // ida já concluída: a carteira tem saldo para a volta
    await c.mine(1);
    await reconcile(deps());
    await c.testClient.setAutomine(false);
    await toWallet("10"); // ida: reservada na custódia e, minerada, já na carteira
    await c.user.writeContract({
      address: c.token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [c.ctx.treasury.address, 3_000_000n],
    }); // volta: sai da carteira, ainda não creditada
    await c.mine(1); // as duas com 1 confirmação (CONFIRMATIONS = 2)
    const r = await reconcile(deps());
    expect(r.ok).toBe(true);
    expect(r.accounts[0].inTransitMicro).toBe(3_000_000n - 10_000_000n);
    expect(r.treasury?.diffMicro).toBe(0n);
  });

  it("diferença forçada no ledger vira alerta", async () => {
    await db.update(accounts).set({ availableCents: 100_001n });
    const r = await reconcile(deps());
    expect(r.ok).toBe(false);
    expect(r.accounts[0].diffMicro).toBe(10_000n);
    expect(r.treasury?.diffMicro).toBe(-10_000n);
  });

  it("npm run reconcile sai com 0 quando fecha e ≠ 0 quando há diferença", async () => {
    expect(await db.select().from(accounts)).toHaveLength(1);
    const env = {
      ...process.env,
      RPC_URL: c.rpcUrl,
      TREASURY_PRIVATE_KEY: KEYS.treasury,
      NEXT_PUBLIC_TOKEN_ADDRESS: c.token,
      CONFIRMATIONS: "2",
    };
    const run = promisify(execFile);
    const ok = await run("node", ["scripts/reconcile.ts"], { env });
    expect(ok.stdout).toMatch(/Tudo confere/);

    await db.update(accounts).set({ availableCents: 99_999n });
    await expect(run("node", ["scripts/reconcile.ts"], { env })).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringMatching(/DIFERENÇA/),
    });
  });
});
