"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { ApiError, useApi } from "@/lib/api-client";
import type { MeView, TransferView } from "@/lib/types";
import { AccountCard } from "./AccountCard";
import { TransferForm } from "./TransferForm";
import { TransferStatus } from "./TransferStatus";
import { WalletCard } from "./WalletCard";

export function Dashboard() {
  const api = useApi();
  const { logout } = usePrivy();
  const [me, setMe] = useState<MeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<TransferView | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<MeView>("/api/me"));
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

  function onStarted(t: TransferView) {
    setCurrent(t);
    refresh(); // a reserva aparece na hora no saldo disponível
  }

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
        <>
          <div className="grid">
            <AccountCard
              availableCents={BigInt(me.account.availableCents)}
              reservedCents={BigInt(me.account.reservedCents)}
            />
            <WalletCard wallet={me.wallet} onActivated={refresh} />
          </div>
          {me.wallet && (
            <div className="grid">
              <TransferForm
                me={me}
                busy={current?.status === "PROCESSANDO"}
                onStarted={onStarted}
              />
              {current && <TransferStatus key={current.id} initial={current} onSettled={refresh} />}
            </div>
          )}
        </>
      )}
    </main>
  );
}
