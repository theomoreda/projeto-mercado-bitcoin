"use client";

import { useRef, useState } from "react";
import type { Address } from "viem";
import { sepolia } from "viem/chains";
import { ApiError, useApi } from "@/lib/api-client";
import { encodeTransfer } from "@/lib/erc20";
import { centsToMicro, formatCents, MICRO_PER_CENT } from "@/lib/money";
import { errorMessage, walletErrorMessage } from "@/lib/transfer-ui";
import type { MeView, TransferView } from "@/lib/types";
import { useAuth } from "./auth/AuthContext";
import { NetworkWarning, useSepoliaWallet } from "./NetworkGuard";
import type { Draft } from "./TransferForm";
import { shortAddress } from "./WalletCard";

const TOKEN = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as Address | undefined;

type Props = {
  me: MeView;
  draft: Draft;
  onBack: () => void;
  /** Ida (MB → wallet): a API já criou a transferência. */
  onStarted: (t: TransferView) => void;
  /** Volta (wallet → MB): a wallet já assinou; o registro na API segue na tela de status. */
  onSigned: (draft: Draft, txHash: string) => void;
};

/** Telas 11 e 11b: revisar antes de mover o dinheiro. */
export function TransferReview({ me, draft, onBack, onStarted, onSigned }: Props) {
  const api = useApi();
  const { sendTransaction } = useAuth();
  const { wallet, wrongNetwork, ensureSepolia } = useSepoliaWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Trava síncrona: um duplo clique não pode disparar duas assinaturas antes do re-render.
  const inFlight = useRef(false);

  const toWallet = draft.direction === "MB_TO_WALLET";
  const account = BigInt(me.account.availableCents);
  const walletCents = BigInt(me.wallet?.balanceMicro ?? "0") / MICRO_PER_CENT;
  const address = me.wallet ? shortAddress(me.wallet.address) : "";
  const after = toWallet
    ? `Conta ${formatCents(account - draft.cents)} · Wallet ${formatCents(walletCents + draft.cents)}`
    : `Conta ${formatCents(account + draft.cents)} · Wallet ${formatCents(walletCents - draft.cents)}`;

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (toWallet) {
        const t = await api<TransferView>("/api/transfers", {
          method: "POST",
          body: JSON.stringify({
            direction: draft.direction,
            amount: draft.amountText,
            clientRequestId: draft.requestId,
          }),
        });
        onStarted(t);
        return;
      }
      // Volta: assina uma única vez. Depois do hash, nada aqui volta a assinar (bug 5): a tela
      // de status registra o hash na API e repete só o registro se ele falhar.
      const hash = await signFromWallet();
      if (hash) onSigned(draft, hash);
    } catch (err) {
      setError(errorMessage(err instanceof ApiError ? err.code : ""));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function signFromWallet(): Promise<string | null> {
    if (!wallet || !me.wallet || !TOKEN) {
      setError("Sua wallet não está pronta. Recarregue a página e tente de novo.");
      return null;
    }
    try {
      await ensureSepolia();
      const { hash } = await sendTransaction(
        {
          to: TOKEN,
          data: encodeTransfer(me.wallet.mbDepositAddress as Address, centsToMicro(draft.cents)),
          value: 0,
          chainId: sepolia.id,
        },
        wallet.address,
      );
      return hash;
    } catch (err) {
      setError(walletErrorMessage(err instanceof Error ? err.message : String(err)));
      return null;
    }
  }

  return (
    <section className="card center-card" aria-labelledby="revisar">
      <h1 id="revisar">Revise a transferência</h1>
      <p className="big-amount">
        {formatCents(draft.cents)}
        <span>Mock USDC</span>
      </p>
      <dl className="review-list">
        <dt>De</dt>
        <dd>{toWallet ? "Conta MB (custodial)" : `Minha wallet · ${address}`}</dd>
        <dt>Para</dt>
        <dd>{toWallet ? `Minha wallet · ${address}` : "Conta MB (custodial)"}</dd>
        <dt>Rede</dt>
        <dd>Sepolia (teste)</dd>
        <dt>Taxa de rede</dt>
        <dd>{toWallet ? "Paga pelo MB na demonstração" : "Paga em Sepolia ETH pela sua wallet"}</dd>
        <dt>Saldos após confirmar</dt>
        <dd>{after}</dd>
      </dl>
      {!toWallet && wrongNetwork && <NetworkWarning />}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>
          Voltar
        </button>
        <button
          type="button"
          className="btn"
          onClick={confirm}
          disabled={busy || (!toWallet && wrongNetwork)}
        >
          {busy ? (toWallet ? "Enviando…" : "Assinando…") : "Confirmar transferência"}
        </button>
      </div>
    </section>
  );
}
