"use client";

import {
  PrivyProvider,
  useCreateWallet,
  useLoginWithEmail,
  usePrivy,
  useSendTransaction,
  useWallets,
} from "@privy-io/react-auth";
import { useMemo } from "react";
import { sepolia } from "viem/chains";
import { AuthContext, type AuthApi } from "./AuthContext";

/** Liga os hooks da Privy à interface `AuthApi`. */
function PrivyBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { createWallet } = useCreateWallet();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const privyWallet = wallets.find((w) => w.walletClientType === "privy") ?? null;

  const api = useMemo<AuthApi>(
    () => ({
      ready,
      authenticated,
      email: user?.email?.address ?? null,
      hasEmbeddedWallet: Boolean(user?.wallet),
      wallet: privyWallet
        ? {
            address: privyWallet.address,
            chainId: privyWallet.chainId,
            switchChain: (id) => privyWallet.switchChain(id),
          }
        : null,
      sendCode: (email) => sendCode({ email }),
      loginWithCode: (code) => loginWithCode({ code }),
      logout,
      getAccessToken,
      createWallet: async () => {
        await createWallet();
      },
      sendTransaction: (tx, from) =>
        sendTransaction(tx, { address: from, uiOptions: { showWalletUIs: false } }),
    }),
    [
      ready,
      authenticated,
      user,
      privyWallet,
      sendCode,
      loginWithCode,
      logout,
      getAccessToken,
      createWallet,
      sendTransaction,
    ],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function PrivyAuth({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        // Só Sepolia (RNF-01): a carteira não envia nem troca para outra rede.
        defaultChain: sepolia,
        supportedChains: [sepolia],
        // A carteira é criada no botão "Ativar" e assina sem pop-ups (princípio de abstração).
        embeddedWallets: { ethereum: { createOnLogin: "off" }, showWalletUIs: false },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
