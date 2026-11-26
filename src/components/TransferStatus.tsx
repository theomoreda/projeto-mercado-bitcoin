"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/api-client";
import { formatMicro } from "@/lib/money";
import { DIRECTION_LABEL, statusCopy } from "@/lib/transfer-ui";
import type { TransferView } from "@/lib/types";

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.etherscan.io";
const POLL_MS = 3_000;

type Props = { initial: TransferView; onSettled: () => void };

/** Acompanha a operação atual até um estado final (RF-07, RF-08, RF-10). */
export function TransferStatus({ initial, onSettled }: Props) {
  const api = useApi();
  const [t, setT] = useState(initial);

  useEffect(() => {
    if (t.status !== "PROCESSANDO") return;
    const timer = setTimeout(async () => {
      try {
        const next = await api<TransferView>(`/api/transfers/${t.id}`);
        setT(next);
        if (next.status !== "PROCESSANDO") onSettled();
      } catch {
        setT((cur) => ({ ...cur })); // tenta de novo no próximo ciclo
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [t, api, onSettled]);

  const copy = statusCopy(t);
  return (
    <section className="card" aria-live="polite">
      <h2>Operação atual</h2>
      <p>
        {DIRECTION_LABEL[t.direction]} · <strong>{formatMicro(BigInt(t.amountMicro))} USDC</strong>
      </p>
      <p className={copy.tone}>
        <strong>{copy.title}</strong>
      </p>
      {copy.detail && <p className="muted">{copy.detail}</p>}
      {t.txHash && (
        <a
          className="link-out"
          href={`${EXPLORER}/tx/${t.txHash}`}
          target="_blank"
          rel="noreferrer"
        >
          Ver comprovante ↗
        </a>
      )}
      {t.txHash && (
        <details>
          <summary>Detalhes técnicos</summary>
          <dl className="tech">
            <dt>Rede</dt>
            <dd>Sepolia (testnet)</dd>
            <dt>Hash da transação</dt>
            <dd className="mono">{t.txHash}</dd>
            {t.confirmations !== null && (
              <>
                <dt>Confirmações</dt>
                <dd>{t.confirmations}</dd>
              </>
            )}
          </dl>
        </details>
      )}
    </section>
  );
}
