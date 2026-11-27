import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accounts, transfers } from "../../src/db/schema.ts";
import { handleCreateTransfer, handleGetTransfer } from "../../src/lib/transfers.ts";
import { handleActivateWallet } from "../../src/lib/wallet.ts";
import { startChain, type TestChain } from "./anvil.ts";
import { db, resetDb } from "./db.ts";
import { makeDeps, req } from "./deps.ts";

let c: TestChain;
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const deps = () => makeDeps({ demo: { email: "Demo@X.com", wallet: WALLET } }, c.ctx);
const rawPost = (body: string) =>
  new Request("http://test/api/transfers", {
    method: "POST",
    headers: { authorization: "Bearer tok-demo", "content-type": "application/json" },
    body,
  });

beforeAll(async () => {
  c = await startChain(8555);
  await c.mint(c.ctx.treasury.address, 1_000_000_000n);
});
afterAll(() => c?.stop());
beforeEach(async () => {
  await resetDb();
  await c.testClient.setAutomine(true);
  await handleActivateWallet(req("/api/wallet", "tok-demo", {}), deps());
});

describe("POST /api/transfers: corpo que não é um pedido", () => {
  it.each(["null", "42", '"texto"', "[]", "{", ""])("corpo %j → 400, não 500", async (body) => {
    const res = await handleCreateTransfer(rawPost(body), deps());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("pedido_invalido");
  });
});

describe("GET /api/transfers/:id", () => {
  it.each(["abc", "123", "../etc/passwd", "00000000-0000-0000-0000-00000000000g"])(
    "id %j que não é UUID → 404, não 500",
    async (id) => {
      const res = await handleGetTransfer(req(`/api/transfers/${id}`, "tok-demo"), deps(), id);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("nao_encontrada");
    },
  );

  it("UUID válido que não existe → 404", async () => {
    const id = randomUUID();
    const res = await handleGetTransfer(req(`/api/transfers/${id}`, "tok-demo"), deps(), id);
    expect(res.status).toBe(404);
  });

  it("RPC fora do ar durante a consulta devolve o estado atual, não 500", async () => {
    await c.testClient.setAutomine(false);
    const created = await handleCreateTransfer(
      req("/api/transfers", "tok-demo", {
        direction: "MB_TO_WALLET",
        amount: "5",
        clientRequestId: randomUUID(),
      }),
      deps(),
    );
    const { id } = await created.json();
    const down = { ...deps(), chain: async () => Promise.reject(new Error("rpc fora do ar")) };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleGetTransfer(req(`/api/transfers/${id}`, "tok-demo"), down, id);
    log.mockRestore();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id, status: "PROCESSANDO", confirmations: null });
    const [t] = await db.select().from(transfers).where(eq(transfers.id, id));
    expect(t.status).toBe("PROCESSANDO"); // nada foi estornado nem confirmado por engano
  });
});

describe("e-mail da conta", () => {
  it("é gravado em minúsculas mesmo quando o login vem com maiúsculas", async () => {
    const [a] = await db.select().from(accounts);
    expect(a.email).toBe("demo@x.com");
  });
});
