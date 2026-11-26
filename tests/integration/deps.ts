import type { Address } from "viem";
import type { ChainCtx } from "../../src/lib/chain.ts";
import type { AppDeps } from "../../src/lib/deps.ts";
import { db } from "./db.ts";

/** Usuários Privy falsos: token "tok-<id>" → did:privy:<id>. */
export type FakeUser = { email: string; wallet?: Address };

export function makeDeps(users: Record<string, FakeUser>, chain?: ChainCtx): AppDeps {
  return {
    db,
    verify: async (token) => {
      const id = token.replace(/^tok-/, "");
      if (!users[id]) throw new Error("invalid token");
      return { privyUserId: `did:privy:${id}`, email: users[id].email };
    },
    lookupWallet: async (privyUserId) =>
      users[privyUserId.replace("did:privy:", "")]?.wallet ?? null,
    config: {
      demoEmails: Object.values(users).map((u) => u.email.toLowerCase()),
      initialCents: 100_000n,
      confirmations: 2n,
      observationWindowMs: 60_000,
    },
    chain: async () => {
      if (!chain) throw new Error("sem cadeia neste teste");
      return chain;
    },
  };
}

export const req = (path: string, token?: string, body?: unknown) =>
  new Request(`http://test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
