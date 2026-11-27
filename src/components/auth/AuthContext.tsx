"use client";

import { createContext, useContext } from "react";

/**
 * O que a interface precisa da autenticação e da carteira embutida.
 *
 * Em produção quem preenche é a Privy (`PrivyAuth`). Nos testes e2e (Playwright) quem preenche é
 * `MockAuth`, que não sai para a rede. Os componentes só conhecem esta interface, então a mesma
 * tela roda nos dois casos.
 */
export type EmbeddedWallet = {
  address: string;
  /** CAIP-2, ex.: "eip155:11155111" (Sepolia). */
  chainId: string;
  switchChain: (chainId: number) => Promise<void>;
};

export type TxRequest = { to: string; data: `0x${string}`; value: number; chainId: number };

export type AuthApi = {
  ready: boolean;
  authenticated: boolean;
  email: string | null;
  /** O usuário já tem a carteira embutida criada na Privy (pode faltar o registro na API). */
  hasEmbeddedWallet: boolean;
  wallet: EmbeddedWallet | null;
  sendCode: (email: string) => Promise<void>;
  loginWithCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  createWallet: () => Promise<void>;
  /** Assina e transmite pela carteira embutida, sem pop-up. Devolve o hash. */
  sendTransaction: (tx: TxRequest, from: string) => Promise<{ hash: string }>;
};

export const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth fora do AuthContext");
  return auth;
}
