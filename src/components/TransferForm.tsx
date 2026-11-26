"use client";

import { useState } from "react";
import type { Direction } from "@/db/schema";
import { ApiError, useApi } from "@/lib/api-client";
import { formatCents, MICRO_PER_CENT, parseAmount } from "@/lib/money";
import { amountError, DIRECTION_LABEL, errorMessage, truncateInput } from "@/lib/transfer-ui";
import type { MeView, TransferView } from "@/lib/types";

type Props = { me: MeView; busy: boolean; onStarted: (t: TransferView) => void };

export function TransferForm({ me, busy, onStarted }: Props) {
  const api = useApi();
  const [direction, setDirection] = useState<Direction>("MB_TO_WALLET");
  const [amount, setAmount] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Um id por intenção de envio: duplo clique ou reenvio não duplicam a transferência.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const available =
    direction === "MB_TO_WALLET"
      ? BigInt(me.account.availableCents)
      : BigInt(me.wallet?.balanceMicro ?? "0") / MICRO_PER_CENT;
  const validation = amountError(amount, available);
  const canSubmit = !busy && !submitting && parseAmount(amount, available).ok;

  function onAmountChange(value: string) {
    const t = truncateInput(value);
    setAmount(t.text);
    setTruncated(t.truncated);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await api<TransferView>("/api/transfers", {
        method: "POST",
        body: JSON.stringify({ direction, amount, clientRequestId: requestId }),
      });
      onStarted(t);
      setAmount("");
      setRequestId(crypto.randomUUID());
    } catch (err) {
      setError(errorMessage(err instanceof ApiError ? err.code : ""));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Transferir</h2>
      <div className="segmented" role="radiogroup" aria-label="Sentido">
        {(Object.keys(DIRECTION_LABEL) as Direction[]).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={direction === d}
            className={direction === d ? "active" : ""}
            disabled={d === "WALLET_TO_MB"}
            onClick={() => setDirection(d)}
          >
            {DIRECTION_LABEL[d]}
          </button>
        ))}
      </div>
      <label>
        Valor (USDC)
        <input
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
        />
      </label>
      <p className="muted">Disponível: {formatCents(available)} USDC</p>
      {truncated && <p className="muted">Use até duas casas decimais.</p>}
      {validation && <p className="error">{validation}</p>}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={!canSubmit}>
        {submitting ? "Enviando…" : "Transferir"}
      </button>
    </form>
  );
}
