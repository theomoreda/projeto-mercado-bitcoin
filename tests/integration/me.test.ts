import { beforeEach, describe, expect, it } from "vitest";
import { accounts } from "../../src/db/schema.ts";
import type { Verifier } from "../../src/lib/auth.ts";
import { handleMe } from "../../src/lib/me.ts";
import { db, resetDb } from "./db.ts";

const config = { demoEmails: ["demo@inteli.edu.br"], initialCents: 100_000n };

const verify: Verifier = async (token) => {
  if (token === "valid-demo") return { privyUserId: "did:privy:demo", email: "Demo@Inteli.edu.br" };
  if (token === "valid-other") return { privyUserId: "did:privy:other", email: "x@y.com" };
  throw new Error("invalid token");
};

const request = (token?: string) =>
  new Request("http://test/api/me", { headers: token ? { authorization: `Bearer ${token}` } : {} });

const call = (token?: string) => handleMe(request(token), { db, verify, config });

beforeEach(resetDb);

describe("GET /api/me", () => {
  it("sem token → 401", async () => {
    expect((await call()).status).toBe(401);
  });

  it("token inválido → 401", async () => {
    expect((await call("forged")).status).toBe(401);
  });

  it("e-mail fora de DEMO_EMAILS → 403 acesso restrito, sem criar conta", async () => {
    const res = await call("valid-other");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "acesso_restrito" });
    expect(await db.select().from(accounts)).toHaveLength(0);
  });

  it("primeiro acesso cria a conta demo com o saldo inicial (e-mail sem diferenciar maiúsculas)", async () => {
    const res = await call("valid-demo");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      email: "Demo@Inteli.edu.br",
      account: { availableCents: "100000", reservedCents: "0" },
      wallet: null,
    });
  });

  it("acessos concorrentes não duplicam a conta", async () => {
    await Promise.all([call("valid-demo"), call("valid-demo"), call("valid-demo")]);
    expect(await db.select().from(accounts)).toHaveLength(1);
  });
});
