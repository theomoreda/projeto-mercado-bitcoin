"use client";

import { useCreateWallet, usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { useApi } from "@/lib/api-client";
import { formatMicro } from "@/lib/money";

type Props = {
  wallet: null | { address: string; balanceMicro: string };
  onActivated: () => void;
};

export function WalletCard({ wallet, onActivated }: Props) {
  const api = useApi();
  const { user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      if (!user?.wallet) await createWallet();
      await api("/api/wallet", { method: "POST" });
      onActivated();
    } catch {
      setError("Não foi possível ativar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(address: string) {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!wallet) {
    return (
      <section className="card">
        <h2>Minha carteira</h2>
        <p className="muted">
          Uma carteira só sua, para guardar seus USDC fora da Conta MB. Não precisa instalar nada
          nem anotar senhas.
        </p>
        {error && <p className="error">{error}</p>}
        <button onClick={activate} disabled={busy}>
          {busy ? "Ativando…" : "Ativar minha carteira"}
        </button>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Minha carteira</h2>
      <p className="balance">
        {formatMicro(BigInt(wallet.balanceMicro))} <span>USDC</span>
      </p>
      <p className="muted address">
        {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}{" "}
        <button className="link" onClick={() => copy(wallet.address)}>
          {copied ? "Copiado ✓" : "Copiar endereço"}
        </button>
      </p>
    </section>
  );
}
