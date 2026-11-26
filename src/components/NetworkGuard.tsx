"use client";

import { useWallets } from "@privy-io/react-auth";
import { useCallback } from "react";
import { sepolia } from "viem/chains";

const SEPOLIA_CAIP2 = `eip155:${sepolia.id}`;

/** Carteira embutida do usuário e garantia de que ela está na Sepolia (RNF-01). */
export function useSepoliaWallet() {
  const { wallets } = useWallets();
  const wallet = wallets.find((w) => w.walletClientType === "privy") ?? null;
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
    <p className="notice">
      Sua carteira está conectada a uma rede diferente da usada nesta demonstração. Recarregue a
      página; se o aviso continuar, saia e entre novamente.
    </p>
  );
}
