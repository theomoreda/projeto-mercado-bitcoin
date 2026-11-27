"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthContext, type AuthApi } from "./AuthContext";

/**
 * Autenticação simulada, só para os testes e2e (Playwright) e só fora de produção.
 * O teste configura o cenário em `window.__MB_E2E__` antes de a página carregar
 * (`page.addInitScript`) e intercepta `/api/*` com `page.route`.
 */
export type E2EScenario = {
  authenticated?: boolean;
  email?: string;
  /** Endereço da carteira embutida já criada na Privy (null = ainda não criada). */
  walletAddress?: string | null;
  /** Rede em que a carteira está (CAIP-2). Padrão: Sepolia. */
  chainId?: string;
  /** Código aceito no login. Padrão: "123456". */
  validCode?: string;
  /** Resultado de `sendTransaction`. */
  sendTx?: "ok" | "insufficient_funds" | "rejected";
  txHash?: string;
};

declare global {
  interface Window {
    __MB_E2E__?: E2EScenario;
    /** Quantas vezes a carteira assinou: o teste do bug 5 confere que é 1. */
    __MB_E2E_SIGNED__?: number;
  }
}

const SEPOLIA = "eip155:11155111";
const DEFAULT_ADDRESS = `0x7a3F${"0".repeat(32)}9c2B`;

function scenario(): E2EScenario {
  return (typeof window !== "undefined" && window.__MB_E2E__) || {};
}

export function MockAuth({ children }: { children: React.ReactNode }) {
  // O cenário só existe no navegador: lê depois de montar para não divergir do HTML do servidor.
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState(SEPOLIA);
  const pendingEmail = useRef<string | null>(null);

  useEffect(() => {
    const s = scenario();
    /* eslint-disable react-hooks/set-state-in-effect -- carga única do cenário do teste */
    setAuthenticated(Boolean(s.authenticated));
    setEmail(s.authenticated ? (s.email ?? "demo@mbbridge.dev") : null);
    setWalletAddress(s.walletAddress ?? null);
    setChainId(s.chainId ?? SEPOLIA);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const api = useMemo<AuthApi>(() => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    return {
      ready,
      authenticated,
      email,
      hasEmbeddedWallet: walletAddress !== null,
      wallet: walletAddress
        ? {
            address: walletAddress,
            chainId,
            switchChain: async (id) => {
              // Simula uma carteira que se recusa a trocar de rede quando o cenário pede outra.
              if (scenario().chainId && scenario().chainId !== SEPOLIA) throw new Error("rede");
              setChainId(`eip155:${id}`);
            },
          }
        : null,
      sendCode: async (e) => {
        await delay(50);
        pendingEmail.current = e;
      },
      loginWithCode: async (code) => {
        await delay(50);
        if (code !== (scenario().validCode ?? "123456")) throw new Error("invalid_credentials");
        setEmail(pendingEmail.current ?? scenario().email ?? "demo@mbbridge.dev");
        setAuthenticated(true);
      },
      logout: async () => {
        setAuthenticated(false);
        setEmail(null);
      },
      getAccessToken: async () => "e2e-token",
      createWallet: async () => {
        await delay(300);
        setWalletAddress(scenario().walletAddress ?? DEFAULT_ADDRESS);
      },
      sendTransaction: async () => {
        await delay(100);
        window.__MB_E2E_SIGNED__ = (window.__MB_E2E_SIGNED__ ?? 0) + 1;
        const mode = scenario().sendTx ?? "ok";
        if (mode === "insufficient_funds") {
          throw new Error("insufficient funds for gas * price + value");
        }
        if (mode === "rejected") throw new Error("User rejected the request.");
        return { hash: scenario().txHash ?? `0x3b7d${"0".repeat(56)}a90f` };
      },
    };
  }, [ready, authenticated, email, walletAddress, chainId]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}
