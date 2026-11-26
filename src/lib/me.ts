import type { Address } from "viem";
import type { Account } from "../db/schema.ts";
import { authenticate, type Identity } from "./auth.ts";
import { tokenBalance } from "./chain.ts";
import type { AppDeps } from "./deps.ts";
import { HttpError, respond } from "./http.ts";
import { createAccount } from "./ledger.ts";

/** Autentica e devolve a conta demo, criando-a no primeiro acesso de um e-mail permitido. */
export async function requireAccount(
  req: Request,
  deps: Pick<AppDeps, "db" | "verify" | "config">,
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

export function handleMe(req: Request, deps: AppDeps): Promise<Response> {
  return respond(async () => {
    const { identity, account } = await requireAccount(req, deps);
    const address = account.walletAddress as Address | null;
    return {
      email: identity.email,
      account: { availableCents: account.availableCents, reservedCents: account.reservedCents },
      wallet: address
        ? { address, balanceMicro: await tokenBalance(await deps.chain(), address) }
        : null,
    };
  });
}
