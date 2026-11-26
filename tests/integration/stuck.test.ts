import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, transfers } from "../../src/db/schema.ts";
import { tokenBalance } from "../../src/lib/chain.ts";
import { handleCreateTransfer, handleGetTransfer } from "../../src/lib/transfers.ts";
import { handleActivateWallet } from "../../src/lib/wallet.ts";
import { startChain, type TestChain } from "./anvil.ts";
import { db, resetDb } from "./db.ts";
import { makeDeps, req } from "./deps.ts";

let c: TestChain;
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const deps = () => makeDeps({ demo: { email: "demo@x.com", wallet: WALLET } }, c.ctx);
const send = async (amount: string) =>
  (
    await handleCreateTransfer(
      req("/api/transfers", "tok-demo", { direction: "MB_TO_WALLET", amount, clientRequestId: randomUUID() }),
      deps(),
    )
  ).json();
const status = async (id: string) =>
  (await handleGetTransfer(req(`/api/transfers/${id}`, "tok-demo"), deps(), id)).json();
const expire = (id: string) =>
  db.update(transfers).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(transfers.id, id));
const account = async () => (await db.select().from(accounts))[0];

beforeAll(async () => {
  c = await startChain(8553);
  await c.mint(c.ctx.treasury.address, 1_000_000_000n);
});
afterAll(() => c?.stop());
beforeEach(async () => {
  await resetDb();
  await c.testClient.setAutomine(true);
  await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
  await c.testClient.setAutomine(false);
});

describe("transação presa após a janela de observação", () => {
  it("envia cancelamento, e só estorna quando o nonce é consumido pelo cancelamento", async () => {
    const before = await tokenBalance(c.ctx, WALLET);
    const t = await send("7");
    await expire(t.id);

    expect(await status(t.id)).toMatchObject({ status: "PROCESSANDO" }); // cancelamento enviado
    expect((await account()).reservedCents).toBe(700n); // nada estornado ainda

    await c.mine(2); // minera o cancelamento (taxa maior substitui o original)
    expect(await status(t.id)).toMatchObject({ status: "FALHOU", failureReason: "transacao_expirada" });
    expect(await status(t.id)).toMatchObject({ status: "FALHOU" });

    const a = await account();
    expect([a.availableCents, a.reservedCents]).toEqual([100_000n, 0n]);
    expect(await tokenBalance(c.ctx, WALLET)).toBe(before); // o original nunca minerou
  });

  it("se o original minera antes do cancelamento, a transferência confirma (sem estorno)", async () => {
    const t = await send("3");
    await expire(t.id);
    await c.mine(2);
    expect(await status(t.id)).toMatchObject({ status: "CONFIRMADA" });
    const a = await account();
    expect([a.availableCents, a.reservedCents]).toEqual([100_000n - 300n, 0n]);
  });

  it("antes de expirar, um tx pendente só espera (sem cancelamento)", async () => {
    const t = await send("1");
    expect(await status(t.id)).toMatchObject({ status: "PROCESSANDO" });
    const pending = await c.pub.getTransactionCount({ address: c.ctx.treasury.address, blockTag: "pending" });
    const mined = await c.pub.getTransactionCount({ address: c.ctx.treasury.address, blockTag: "latest" });
    expect(pending - mined).toBe(1); // só o original no mempool
    await c.mine(2);
    expect(await status(t.id)).toMatchObject({ status: "CONFIRMADA" });
  });
});
