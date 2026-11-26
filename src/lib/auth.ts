import { PrivyClient } from "@privy-io/node";
import { getAddress, type Address } from "viem";
import { HttpError } from "./http.ts";

export type Identity = { privyUserId: string; email: string | null };
/** Valida um access token Privy e devolve quem é o usuário. Lança se inválido. */
export type Verifier = (accessToken: string) => Promise<Identity>;

/** Lê o Bearer token da requisição e o valida. 401 se ausente ou inválido. */
export async function authenticate(req: Request, verify: Verifier): Promise<Identity> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, "nao_autenticado");
  try {
    return await verify(token);
  } catch {
    throw new HttpError(401, "nao_autenticado");
  }
}

let client: PrivyClient | undefined;
const privy = () =>
  (client ??= new PrivyClient({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
  }));
const emails = new Map<string, string | null>();

/** Verificador real: assinatura do token com @privy-io/node + e-mail do usuário (em cache). */
export const privyVerifier: Verifier = async (accessToken) => {
  const { user_id } = await privy().utils().auth().verifyAccessToken(accessToken);
  if (!emails.has(user_id)) {
    const user = await privy().users()._get(user_id);
    const email = user.linked_accounts.find((a) => a.type === "email");
    emails.set(user_id, email && "address" in email ? email.address : null);
  }
  return { privyUserId: user_id, email: emails.get(user_id) ?? null };
};

/** Endereço da carteira embutida Ethereum do usuário, direto da Privy (sem cache: muda na ativação). */
export async function privyWalletLookup(privyUserId: string): Promise<Address | null> {
  const user = await privy().users()._get(privyUserId);
  const wallet = user.linked_accounts.find(
    (a) =>
      a.type === "wallet" &&
      "connector_type" in a &&
      a.connector_type === "embedded" &&
      a.chain_type === "ethereum",
  );
  return wallet && "address" in wallet ? getAddress(wallet.address) : null;
}
