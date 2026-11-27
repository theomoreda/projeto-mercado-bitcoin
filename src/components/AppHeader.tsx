"use client";

import { Logo, NetworkBadge } from "./Logo";

export type View = "inicio" | "transferir";

type Props = {
  email: string | null;
  view: View;
  canTransfer: boolean;
  onNavigate: (v: View) => void;
  onLogout: () => void;
};

export function AppHeader({ email, view, canTransfer, onNavigate, onLogout }: Props) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Logo />
        <nav className="nav" aria-label="Principal">
          <button
            type="button"
            aria-current={view === "inicio" ? "page" : undefined}
            onClick={() => onNavigate("inicio")}
          >
            Início
          </button>
          <button
            type="button"
            aria-current={view === "transferir" ? "page" : undefined}
            disabled={!canTransfer}
            title={canTransfer ? undefined : "Ative sua wallet para transferir"}
            onClick={() => onNavigate("transferir")}
          >
            Transferir
          </button>
        </nav>
        <div className="header-right">
          <NetworkBadge />
          {email && (
            <span className="user">
              <span className="avatar" aria-hidden="true">
                {email[0]}
              </span>
              <span>{email}</span>
            </span>
          )}
          <button type="button" className="btn-quiet" onClick={onLogout}>
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
