import { PrivyClient } from "@privy-io/node";
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

let privy: PrivyClient | undefined;
const emails = new Map<string, string | null>();

/** Verificador real: assinatura do token com @privy-io/node + e-mail do usuário (em cache). */
export const privyVerifier: Verifier = async (accessToken) => {
  privy ??= new PrivyClient({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
  });
  const { user_id } = await privy.utils().auth().verifyAccessToken(accessToken);
  if (!emails.has(user_id)) {
    const user = await privy.users()._get(user_id);
    const email = user.linked_accounts.find((a) => a.type === "email");
    emails.set(user_id, email && "address" in email ? email.address : null);
  }
  return { privyUserId: user_id, email: emails.get(user_id) ?? null };
};
