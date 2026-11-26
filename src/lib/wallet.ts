import { and, eq, isNull } from "drizzle-orm";
import { accounts, type Account } from "../db/schema.ts";
import type { AppDeps } from "./deps.ts";
import { HttpError, isUniqueViolation, respond } from "./http.ts";
import { requireAccount } from "./account.ts";

/**
 * POST /api/wallet — vincula à conta a carteira embutida que a Privy diz pertencer ao
 * usuário. O corpo da requisição é ignorado: o cliente não escolhe o endereço.
 */
export function handleActivateWallet(req: Request, deps: AppDeps): Promise<Response> {
  return respond(async () => {
    const { identity, account } = await requireAccount(req, deps);
    const address = await deps.lookupWallet(identity.privyUserId);
    if (!address) throw new HttpError(409, "carteira_nao_criada");
    if (account.walletAddress === address) return view(account);
    if (account.walletAddress) throw new HttpError(409, "carteira_ja_ativada");

    // A varredura de entradas começa no bloco seguinte à ativação (o que já está
    // minerado é anterior a ela), nunca do zero.
    const block = await (await deps.chain()).publicClient.getBlockNumber({ cacheTime: 0 });
    try {
      const [updated] = await deps.db
        .update(accounts)
        .set({ walletAddress: address, lastScannedBlock: block + 1n })
        .where(and(eq(accounts.id, account.id), isNull(accounts.walletAddress)))
        .returning();
      if (updated) return view(updated);
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, "carteira_em_uso");
      throw err;
    }
    // Outra requisição ativou no meio do caminho: devolve o estado atual.
    const [current] = await deps.db.select().from(accounts).where(eq(accounts.id, account.id));
    if (current.walletAddress !== address) throw new HttpError(409, "carteira_ja_ativada");
    return view(current);
  });
}

const view = (a: Account) => ({ address: a.walletAddress, lastScannedBlock: a.lastScannedBlock });
