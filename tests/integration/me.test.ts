import { beforeEach, describe, expect, it } from "vitest";
import { accounts } from "../../src/db/schema.ts";
import { handleMe } from "../../src/lib/me.ts";
import { db, resetDb } from "./db.ts";
import { makeDeps, req } from "./deps.ts";

const deps = makeDeps({ demo: { email: "Demo@Inteli.edu.br" } });
// "other" é um usuário Privy válido, mas fora de DEMO_EMAILS.
const depsWithOutsider = {
  ...deps,
  verify: async (t: string) =>
    t === "tok-other" ? { privyUserId: "did:privy:other", email: "x@y.com" } : deps.verify(t),
};
const call = (token?: string) => handleMe(req("/api/me", token), depsWithOutsider);

beforeEach(resetDb);

describe("GET /api/me", () => {
  it("sem token → 401", async () => {
    expect((await call()).status).toBe(401);
  });

  it("token inválido → 401", async () => {
    expect((await call("forged")).status).toBe(401);
  });

  it("e-mail fora de DEMO_EMAILS → 403 acesso restrito, sem criar conta", async () => {
    const res = await call("tok-other");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "acesso_restrito" });
    expect(await db.select().from(accounts)).toHaveLength(0);
  });

  it("primeiro acesso cria a conta demo com o saldo inicial (e-mail sem diferenciar maiúsculas)", async () => {
    const res = await call("tok-demo");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      email: "Demo@Inteli.edu.br",
      account: { availableCents: "100000", reservedCents: "0" },
      wallet: null,
    });
  });

  it("acessos concorrentes não duplicam a conta", async () => {
    await Promise.all([call("tok-demo"), call("tok-demo"), call("tok-demo")]);
    expect(await db.select().from(accounts)).toHaveLength(1);
  });
});
