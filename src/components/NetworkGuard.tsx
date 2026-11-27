"use client";

import { useCallback } from "react";
import { sepolia } from "viem/chains";
import { useAuth } from "./auth/AuthContext";

const SEPOLIA_CAIP2 = `eip155:${sepolia.id}`;

/** Carteira embutida do usuário e garantia de que ela está na Sepolia (RNF-01). */
export function useSepoliaWallet() {
  const { wallet } = useAuth();
  const wrongNetwork = wallet !== null && wallet.chainId !== SEPOLIA_CAIP2;

  /** Troca para a Sepolia se preciso; lança se não conseguir (o envio fica bloqueado). */
  const ensureSepolia = useCallback(async () => {
    if (!wallet) throw new Error("carteira indisponível");
    if (wallet.chainId !== SEPOLIA_CAIP2) await wallet.switchChain(sepolia.id);
  }, [wallet]);

  return { wallet, wrongNetwork, ensureSepolia };
}

export function NetworkWarning() {
  return (
    <p className="notice" role="alert">
      Sua wallet está conectada a uma rede diferente da Sepolia, a rede de teste desta demonstração.
      O envio da wallet fica bloqueado. Recarregue a página; se o aviso continuar, saia e entre
      novamente.
    </p>
  );
}
