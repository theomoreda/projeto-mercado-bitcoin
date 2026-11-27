"use client";

import { useState } from "react";
import { useApi } from "@/lib/api-client";
import { formatMicro } from "@/lib/money";
import { useAuth } from "./auth/AuthContext";

export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.etherscan.io";

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Props = {
  wallet: null | { address: string; balanceMicro: string };
  onActivated: () => void;
};

/** Telas 04–06: wallet não ativada, ativando e ativa. */
export function WalletCard({ wallet, onActivated }: Props) {
  const api = useApi();
  const { hasEmbeddedWallet, createWallet } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ok" | "falhou" | null>(null);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      if (!hasEmbeddedWallet) await createWallet();
      await api("/api/wallet", { method: "POST" });
      onActivated();
    } catch {
      setError("Não foi possível ativar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied("ok");
    } catch {
      setCopied("falhou");
    }
    setTimeout(() => setCopied(null), 2000);
  }

  if (!wallet) {
    return (
      <section className="card" aria-labelledby="minha-wallet" aria-busy={busy}>
        <div className="card-head">
          <h2 id="minha-wallet" className="card-label">
            Minha wallet
          </h2>
          <span className="tag">{busy ? "Ativando" : "Não ativada"}</span>
        </div>
        {busy ? (
          <div role="status">
            <p>
              <strong>Criando sua wallet…</strong>
            </p>
            <p className="muted">
              Estamos gerando uma wallet só sua, ligada ao seu e-mail. Isso leva alguns segundos.
            </p>
          </div>
        ) : (
          <p className="muted">
            Você ainda não tem uma wallet própria. Ative em segundos, sem seed phrase e sem instalar
            nada.
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" onClick={activate} disabled={busy}>
          {busy ? "Ativando…" : "Ativar minha wallet"}
        </button>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="minha-wallet">
      <div className="card-head">
        <h2 id="minha-wallet" className="card-label">
          Minha wallet
        </h2>
        <span className="tag tag-ok">Ativa</span>
      </div>
      <p className="balance">
        {formatMicro(BigInt(wallet.balanceMicro))}
        <span>Mock USDC</span>
      </p>
      <div className="row">
        <button
          type="button"
          className="chip"
          onClick={() => copy(wallet.address)}
          aria-label={`Copiar endereço da wallet ${wallet.address}`}
        >
          {shortAddress(wallet.address)}
          <span aria-hidden="true">⧉</span>
        </button>
        <a
          className="link-out"
          href={`${EXPLORER}/address/${wallet.address}`}
          target="_blank"
          rel="noreferrer"
        >
          Ver no explorador <span aria-hidden="true">↗</span>
          <span className="sr-only"> (abre em nova aba)</span>
        </a>
      </div>
      <p className="muted" role="status">
        {copied === "ok" && "Endereço copiado."}
        {copied === "falhou" && "Não deu para copiar. Selecione o endereço no explorador."}
      </p>
    </section>
  );
}
