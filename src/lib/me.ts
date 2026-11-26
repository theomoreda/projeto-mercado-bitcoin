import { eq } from "drizzle-orm";
import type { Address } from "viem";
import { accounts } from "../db/schema.ts";
import { requireAccount } from "./account.ts";
import { tokenBalance } from "./chain.ts";
import type { AppDeps } from "./deps.ts";
import { respond } from "./http.ts";
import { scanInbound } from "./transfers.ts";

export function handleMe(req: Request, deps: AppDeps): Promise<Response> {
  return respond(async () => {
    const { identity, account: initial } = await requireAccount(req, deps);
    let account = initial;
    const address = account.walletAddress as Address | null;
    const chain = address ? await deps.chain() : null;
    if (chain) {
      // Credita entradas que o cliente não chegou a avisar e relê o saldo.
      await scanInbound(deps, chain, account).catch((err) =>
        console.error("varredura falhou", err),
      );
      [account] = await deps.db.select().from(accounts).where(eq(accounts.id, account.id));
    }
    return {
      email: identity.email,
      account: { availableCents: account.availableCents, reservedCents: account.reservedCents },
      wallet:
        address && chain
          ? {
              address,
              balanceMicro: await tokenBalance(chain, address),
              // Destino on-chain da Conta MB para o sentido wallet → MB.
              mbDepositAddress: chain.treasury.address,
            }
          : null,
    };
  });
}
