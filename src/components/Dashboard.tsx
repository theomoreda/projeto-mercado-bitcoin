"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { ApiError, useApi } from "@/lib/api-client";
import { AccountCard } from "./AccountCard";
import { WalletCard } from "./WalletCard";

export type Me = {
  email: string;
  account: { availableCents: string; reservedCents: string };
  wallet: null | { address: string; balanceMicro: string };
};

export function Dashboard() {
  const api = useApi();
  const { logout } = usePrivy();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "acesso_restrito"
          ? "Este e-mail não faz parte da demonstração."
          : "Não foi possível carregar seus dados. Tente novamente.",
      );
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial dos dados
    refresh();
  }, [refresh]);

  return (
    <main className="shell">
      <header className="topbar">
        <strong>MB Wallet Bridge</strong>
        <button className="link" onClick={logout}>
          Sair
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {!me && !error && <p className="muted">Carregando…</p>}
      {me && (
        <div className="grid">
          <AccountCard
            availableCents={BigInt(me.account.availableCents)}
            reservedCents={BigInt(me.account.reservedCents)}
          />
          <WalletCard wallet={me.wallet} onActivated={refresh} />
        </div>
      )}
    </main>
  );
}
