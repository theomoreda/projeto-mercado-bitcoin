"use client";

import { MockAuth } from "@/components/auth/MockAuth";
import { PrivyAuth } from "@/components/auth/PrivyAuth";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
// Login simulado para o Playwright (e2e sem rede). Nunca vale num build de produção.
const mockAuth =
  process.env.NEXT_PUBLIC_E2E_MOCK_AUTH === "1" && process.env.NODE_ENV !== "production";

export function Providers({ children }: { children: React.ReactNode }) {
  if (mockAuth) return <MockAuth>{children}</MockAuth>;
  if (!appId) {
    return (
      <main className="page page-narrow">
        <p className="notice">
          Configuração pendente: defina <code>NEXT_PUBLIC_PRIVY_APP_ID</code> em{" "}
          <code>.env.local</code> (veja o README).
        </p>
      </main>
    );
  }
  return <PrivyAuth appId={appId}>{children}</PrivyAuth>;
}
