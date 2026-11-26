import type { Executor } from "../db";
import type { Account } from "../db/schema";
import { authenticate, type Identity, type Verifier } from "./auth";
import type { ServerConfig } from "./config";
import { HttpError, respond } from "./http";
import { createAccount } from "./ledger";

export type MeDeps = {
  db: Executor;
  verify: Verifier;
  config: Pick<ServerConfig, "demoEmails" | "initialCents">;
};

/** Autentica e devolve a conta demo, criando-a no primeiro acesso de um e-mail permitido. */
export async function requireAccount(
  req: Request,
  deps: MeDeps,
): Promise<{ identity: Identity; account: Account }> {
  const identity = await authenticate(req, deps.verify);
  const email = identity.email?.toLowerCase();
  if (!email || !deps.config.demoEmails.includes(email))
    throw new HttpError(403, "acesso_restrito");
  const account = await createAccount(deps.db, {
    privyUserId: identity.privyUserId,
    email: identity.email!,
    initialCents: deps.config.initialCents,
  });
  return { identity, account };
}

export function handleMe(req: Request, deps: MeDeps): Promise<Response> {
  return respond(async () => {
    const { identity, account } = await requireAccount(req, deps);
    return {
      email: identity.email,
      account: { availableCents: account.availableCents, reservedCents: account.reservedCents },
      wallet: null,
    };
  });
}
