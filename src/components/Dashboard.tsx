"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, useApi } from "@/lib/api-client";
import { formatMicro } from "@/lib/money";
import { DIRECTION_LABEL, statusCopy } from "@/lib/transfer-ui";
import type { MeView, TransferView } from "@/lib/types";
import { AccountCard } from "./AccountCard";
import { AppHeader, type View } from "./AppHeader";
import { useAuth } from "./auth/AuthContext";
import { TransferForm, type Draft } from "./TransferForm";
import { TransferReview } from "./TransferReview";
import { TransferStatus, type Tracked } from "./TransferStatus";
import { WalletCard } from "./WalletCard";

type Screen = "inicio" | "transferir" | "revisar" | "status";

// Envio da wallet assinado mas ainda não registrado: sobrevive a um recarregar da página,
// para a tela continuar registrando o mesmo hash em vez de pedir outra assinatura (bug 5).
const PENDING_KEY = "mb-wallet-bridge:pending-registration";

type StoredPending = { draft: Omit<Draft, "cents"> & { cents: string }; txHash: string };

function loadPending(): Tracked | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredPending;
    return {
      kind: "registering",
      txHash: p.txHash,
      draft: { ...p.draft, cents: BigInt(p.draft.cents) },
    };
  } catch {
    return null;
  }
}

function savePending(tracked: Tracked | null) {
  try {
    if (tracked?.kind === "registering") {
      const p: StoredPending = {
        txHash: tracked.txHash,
        draft: { ...tracked.draft, cents: tracked.draft.cents.toString() },
      };
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    } else {
      sessionStorage.removeItem(PENDING_KEY);
    }
  } catch {
    // sessionStorage indisponível (aba privada): segue só em memória.
  }
}

export function Dashboard() {
  const api = useApi();
  const { email, logout } = useAuth();
  const [me, setMe] = useState<MeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<Screen>("inicio");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tracked, setTracked] = useState<Tracked | null>(null);
  const [last, setLast] = useState<TransferView | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMe(await api<MeView>("/api/me"));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "acesso_restrito"
          ? "Este e-mail não faz parte da demonstração."
          : "Não foi possível carregar seus dados.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- carga inicial e retomada do registro */
    refresh();
    const pending = loadPending();
    if (pending) {
      setTracked(pending);
      setScreen("status");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh]);

  const track = useCallback((next: Tracked | null) => {
    setTracked(next);
    savePending(next);
    if (next?.kind === "transfer") setLast(next.t);
  }, []);

  const onRegistered = useCallback(
    (t: TransferView) => {
      track({ kind: "transfer", t });
      refresh();
    },
    [track, refresh],
  );

  const onSettled = useCallback(
    (t: TransferView) => {
      track({ kind: "transfer", t });
      refresh();
    },
    [track, refresh],
  );

  // Uma operação por vez: a próxima só depois que a atual chegar a um estado final.
  const busy =
    tracked !== null && (tracked.kind === "registering" || tracked.t.status === "PROCESSANDO");

  function navigate(v: View) {
    if (v === "transferir") {
      setDraft(null);
      setScreen("transferir");
    } else {
      setScreen("inicio");
    }
  }

  const header = (
    <AppHeader
      email={me?.email ?? email}
      view={screen === "inicio" ? "inicio" : "transferir"}
      canTransfer={Boolean(me?.wallet)}
      onNavigate={navigate}
      onLogout={logout}
    />
  );

  let body: React.ReactNode;
  if (!me) {
    body = error ? (
      <div className="alert" role="alert">
        <span>{error}</span>
        <button type="button" className="btn-link" onClick={refresh} disabled={loading}>
          {loading ? "Carregando…" : "Tentar de novo"}
        </button>
      </div>
    ) : (
      <p className="muted" role="status">
        Carregando…
      </p>
    );
  } else if (screen === "transferir" && me.wallet) {
    body = (
      <TransferForm
        me={me}
        busy={busy}
        initial={draft}
        onBack={() => setScreen("inicio")}
        onContinue={(d) => {
          setDraft(d);
          setScreen("revisar");
        }}
      />
    );
  } else if (screen === "revisar" && draft && me.wallet) {
    body = (
      <TransferReview
        me={me}
        draft={draft}
        onBack={() => setScreen("transferir")}
        onStarted={(t) => {
          track({ kind: "transfer", t });
          setDraft(null);
          setScreen("status");
          refresh(); // a reserva aparece na hora no saldo disponível
        }}
        onSigned={(d, txHash) => {
          track({ kind: "registering", draft: d, txHash });
          setDraft(null);
          setScreen("status");
        }}
      />
    );
  } else if (screen === "status" && tracked) {
    body = (
      <TransferStatus
        key={tracked.kind === "transfer" ? `${tracked.t.id}:${tracked.t.status}` : tracked.txHash}
        tracked={tracked}
        me={me}
        onRegistered={onRegistered}
        onSettled={onSettled}
        onHome={() => setScreen("inicio")}
        onNew={() => navigate("transferir")}
      />
    );
  } else {
    body = (
      <Home
        me={me}
        last={last}
        error={error}
        onRetry={refresh}
        onActivated={refresh}
        onTransfer={() => navigate("transferir")}
        onOpenLast={() => setScreen("status")}
        hasTracked={tracked !== null}
      />
    );
  }

  return (
    <>
      {header}
      <main className="page">{body}</main>
    </>
  );
}

function Home({
  me,
  last,
  error,
  onRetry,
  onActivated,
  onTransfer,
  onOpenLast,
  hasTracked,
}: {
  me: MeView;
  last: TransferView | null;
  error: string | null;
  onRetry: () => void;
  onActivated: () => void;
  onTransfer: () => void;
  onOpenLast: () => void;
  hasTracked: boolean;
}) {
  const name = me.email.split("@")[0];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Olá, {name.charAt(0).toUpperCase() + name.slice(1)}</h1>
          <p className="muted">Esta é sua conta de demonstração no MB Wallet Bridge.</p>
        </div>
        {me.wallet && (
          <button type="button" className="btn" onClick={onTransfer}>
            Transferir
          </button>
        )}
      </div>
      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-link" onClick={onRetry}>
            Tentar de novo
          </button>
        </div>
      )}
      <div className="grid-2">
        <AccountCard
          availableCents={BigInt(me.account.availableCents)}
          reservedCents={BigInt(me.account.reservedCents)}
        />
        <WalletCard wallet={me.wallet} onActivated={onActivated} />
      </div>
      {me.wallet && (
        <section className="card" aria-labelledby="ultima">
          <h2 id="ultima">Última operação</h2>
          {last ? (
            <div className="row">
              <span>
                {DIRECTION_LABEL[last.direction]} ·{" "}
                <strong>{formatMicro(BigInt(last.amountMicro))} Mock USDC</strong> ·{" "}
                {statusCopy(last).title}
              </span>
              {hasTracked && (
                <button type="button" className="btn-link" onClick={onOpenLast}>
                  Ver detalhes
                </button>
              )}
            </div>
          ) : (
            <p className="muted">
              Nenhuma operação ainda. Faça sua primeira transferência para a sua wallet.
            </p>
          )}
        </section>
      )}
      <section className="card" aria-labelledby="como-funciona">
        <h2 id="como-funciona">Como funciona</h2>
        <ol className="steps">
          <li>
            <span className="num" aria-hidden="true">
              1
            </span>
            <span>
              <strong>Ative sua wallet</strong>
              <span className="muted">
                Uma wallet só sua, criada pelo seu e-mail. Sem seed phrase.
              </span>
            </span>
          </li>
          <li>
            <span className="num" aria-hidden="true">
              2
            </span>
            <span>
              <strong>Transfira Mock USDC</strong>
              <span className="muted">
                Mova saldo entre a conta MB e a wallet, nos dois sentidos.
              </span>
            </span>
          </li>
          <li>
            <span className="num" aria-hidden="true">
              3
            </span>
            <span>
              <strong>Acompanhe na rede</strong>
              <span className="muted">
                Cada operação tem status e link para o explorador da Sepolia.
              </span>
            </span>
          </li>
        </ol>
      </section>
    </>
  );
}
