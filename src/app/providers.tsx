"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { sepolia } from "viem/chains";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function Providers({ children }: { children: React.ReactNode }) {
  if (!appId) {
    return (
      <main className="shell">
        <p className="notice">
          Configuração pendente: defina <code>NEXT_PUBLIC_PRIVY_APP_ID</code> em{" "}
          <code>.env.local</code> (veja o README).
        </p>
      </main>
    );
  }
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
      {children}
    </PrivyProvider>
  );
}
