import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleMe } from "../../src/lib/me.ts";
import { handleActivateWallet } from "../../src/lib/wallet.ts";
import { startChain, type TestChain } from "./anvil.ts";
import { resetDb } from "./db.ts";
import { makeDeps, req, type FakeUser } from "./deps.ts";

let c: TestChain;
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
let users: Record<string, FakeUser>;
const deps = () => makeDeps(users, c.ctx);

beforeAll(async () => {
  c = await startChain(8549);
});
afterAll(() => c?.stop());
beforeEach(async () => {
  await resetDb();
  users = { demo: { email: "demo@x.com" }, other: { email: "other@x.com" } };
});

describe("POST /api/wallet", () => {
  it("sem carteira criada na Privy → 409", async () => {
    const res = await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "carteira_nao_criada" });
  });

  it("registra a carteira da Privy (não a do cliente) e marca o bloco seguinte para a varredura", async () => {
    users.demo.wallet = WALLET;
    const block = await c.pub.getBlockNumber({ cacheTime: 0 });
    const res = await handleActivateWallet(
      req("/api/wallet", "tok-demo", { address: "0x000000000000000000000000000000000000dEaD" }),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      address: WALLET,
      lastScannedBlock: String(block + 1n),
    });
  });

  it("ativar duas vezes é idempotente", async () => {
    users.demo.wallet = WALLET;
    await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
    const res = await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
    expect(res.status).toBe(200);
    expect((await res.json()).address).toBe(WALLET);
  });

  it("endereço já usado por outra conta → 409", async () => {
    users.demo.wallet = WALLET;
    users.other.wallet = WALLET;
    await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
    const res = await handleActivateWallet(req("/api/wallet", "tok-other", {}), deps());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "carteira_em_uso" });
  });
});

describe("GET /api/me com carteira", () => {
  it("mostra os dois saldos separados: custodial e on-chain", async () => {
    users.demo.wallet = WALLET;
    await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
    await c.mint(WALLET, 2_500_000n);
    const res = await handleMe(req("/api/me", "tok-demo"), deps());
    expect(await res.json()).toMatchObject({
      account: { availableCents: "100000", reservedCents: "0" },
      wallet: { address: WALLET, balanceMicro: "2500000" },
    });
  });
});
