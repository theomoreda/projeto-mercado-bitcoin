"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, useApi } from "@/lib/api-client";
import { formatCents, formatMicro } from "@/lib/money";
import { errorMessage, failureReasonCopy, statusCopy } from "@/lib/transfer-ui";
import type { MeView, TransferView } from "@/lib/types";
import type { Draft } from "./TransferForm";
import { EXPLORER, shortAddress } from "./WalletCard";

/** O que a tela de status acompanha: uma transferência já registrada, ou um envio da wallet
 *  já assinado que ainda falta registrar na API (bug 5: nunca reassinar, só registrar de novo). */
export type Tracked =
  { kind: "transfer"; t: TransferView } | { kind: "registering"; draft: Draft; txHash: string };

const POLL_MS = 3_000;
const MAX_POLL_MS = 15_000;
const MAX_AUTO_RETRIES = 5;

type Props = {
  tracked: Tracked;
  me: MeView | null;
  onRegistered: (t: TransferView) => void;
  onSettled: (t: TransferView) => void;
  onHome: () => void;
  onNew: () => void;
};

/** Telas 12–14 (e 12b/12c/13b): processando, confirmada e falhou. */
export function TransferStatus({ tracked, me, onRegistered, onSettled, onHome, onNew }: Props) {
  const api = useApi();
  const [t, setT] = useState<TransferView | null>(tracked.kind === "transfer" ? tracked.t : null);
  const [regError, setRegError] = useState<string | null>(null);
  const [regAttempts, setRegAttempts] = useState(0);
  const [registering, setRegistering] = useState(false);
  const polls = useRef(0);

  const direction = tracked.kind === "transfer" ? tracked.t.direction : tracked.draft.direction;
  const txHash = t?.txHash ?? (tracked.kind === "registering" ? tracked.txHash : null);
  const amount =
    t !== null
      ? formatMicro(BigInt(t.amountMicro))
      : tracked.kind === "registering"
        ? formatCents(tracked.draft.cents)
        : "";

  /** Registra o hash já assinado. Mesmo clientRequestId e mesmo hash: a API não duplica. */
  const register = useCallback(async () => {
    if (tracked.kind !== "registering") return;
    setRegistering(true);
    try {
      const created = await api<TransferView>("/api/transfers", {
        method: "POST",
        body: JSON.stringify({
          direction: tracked.draft.direction,
          txHash: tracked.txHash,
          clientRequestId: tracked.draft.requestId,
        }),
      });
      setRegError(null);
      setT(created);
      onRegistered(created);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setRegError(
        code === "transacao_nao_encontrada"
          ? errorMessage(code)
          : "Sua transferência já saiu da wallet, mas ainda não conseguimos registrá-la no MB. Vamos tentar de novo; você não precisa assinar outra vez.",
      );
      setRegAttempts((n) => n + 1);
    } finally {
      setRegistering(false);
    }
  }, [api, tracked, onRegistered]);

  // Registro automático, com espera crescente entre tentativas.
  useEffect(() => {
    if (tracked.kind !== "registering" || t || registering) return;
    if (regAttempts >= MAX_AUTO_RETRIES) return;
    const wait = regAttempts === 0 ? 0 : Math.min(POLL_MS * 2 ** (regAttempts - 1), MAX_POLL_MS);
    const timer = setTimeout(register, wait);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a nova tentativa
  }, [regAttempts, t]);

  // Acompanha a transferência até um estado final (RF-07, RF-08, RF-10).
  useEffect(() => {
    if (!t || t.status !== "PROCESSANDO") return;
    const wait = Math.min(POLL_MS * 1.5 ** polls.current, MAX_POLL_MS);
    const timer = setTimeout(async () => {
      polls.current += 1;
      try {
        const next = await api<TransferView>(`/api/transfers/${t.id}`);
        setT(next);
        if (next.status !== "PROCESSANDO") onSettled(next);
      } catch {
        setT((cur) => (cur ? { ...cur } : cur)); // tenta de novo no próximo ciclo
      }
    }, wait);
    return () => clearTimeout(timer);
  }, [t, api, onSettled]);

  const status = t?.status ?? "PROCESSANDO";
  const toWallet = direction === "MB_TO_WALLET";
  const explorerLink = txHash && (
    <a className="link-out" href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer">
      {status === "PROCESSANDO" ? "Acompanhar no explorador" : "Ver no explorador"}{" "}
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  );
  const txRow = txHash && (
    <>
      <dt>Transação</dt>
      <dd className="mono" title={txHash}>
        {shortAddress(txHash)}
      </dd>
    </>
  );

  if (status === "PROCESSANDO") {
    const registered = t !== null;
    return (
      <section className="card center-card" aria-labelledby="status-title">
        <div className="status-icon processing" aria-hidden="true" />
        <span className="tag tag-warn status-tag">Processando</span>
        <h1 id="status-title">Sua transferência está a caminho</h1>
        <p className="muted" role="status" aria-live="polite">
          {amount} Mock USDC saindo{" "}
          {toWallet ? "da conta MB para a sua wallet" : "da sua wallet para a conta MB"}. Isso
          costuma levar menos de um minuto.
        </p>
        <ol className="timeline" aria-label="Etapas">
          {!toWallet && (
            <li className="done">
              <span className="dot" aria-hidden="true">
                ✓
              </span>
              Enviado pela sua wallet
            </li>
          )}
          <li className={registered ? "done" : "current"}>
            <span className="dot" aria-hidden="true">
              {registered ? "✓" : ""}
            </span>
            Pedido registrado no MB
          </li>
          <li className={registered ? "current" : ""}>
            <span className="dot" aria-hidden="true" />
            Aguardando confirmação na rede Sepolia
          </li>
          <li>
            <span className="dot" aria-hidden="true" />
            Saldos atualizados
          </li>
        </ol>
        {regError && (
          <div className="alert" role="alert">
            <span>{regError}</span>
            {regAttempts >= MAX_AUTO_RETRIES && (
              <button type="button" className="btn-link" onClick={register} disabled={registering}>
                {registering ? "Registrando…" : "Tentar registrar de novo"}
              </button>
            )}
          </div>
        )}
        <dl className="kv">{txRow}</dl>
        {explorerLink}
      </section>
    );
  }

  const ok = status === "CONFIRMADA";
  const copy = statusCopy({ status, direction });
  return (
    <section className="card center-card" aria-labelledby="status-title">
      <div className={`status-icon ${ok ? "ok" : "err"}`} aria-hidden="true">
        {ok ? "✓" : "!"}
      </div>
      <span className={`tag ${ok ? "tag-ok" : "tag-err"} status-tag`}>
        {ok ? "Confirmada" : "Falhou"}
      </span>
      <div aria-live="polite">
        <h1 id="status-title">
          {ok ? "Transferência confirmada!" : "A transferência não foi concluída"}
        </h1>
        <p className="muted">
          {ok
            ? `${amount} Mock USDC ${toWallet ? "chegaram na sua wallet" : "voltaram para a sua conta MB"}. Os saldos já foram atualizados.`
            : `A rede não confirmou a transação. ${copy.detail}`}
        </p>
      </div>
      {ok && me && (
        <div className="balances">
          <div>
            <span className="muted">Conta MB</span>
            <strong>{formatCents(BigInt(me.account.availableCents))} Mock USDC</strong>
          </div>
          <div>
            <span className="muted">Minha wallet</span>
            <strong>{formatMicro(BigInt(me.wallet?.balanceMicro ?? "0"))} Mock USDC</strong>
          </div>
        </div>
      )}
      <dl className="kv">
        {!ok && (
          <>
            <dt>Valor</dt>
            <dd>{amount} Mock USDC</dd>
            <dt>Motivo</dt>
            <dd>
              {failureReasonCopy(t?.failureReason ?? null) ?? "A rede não confirmou a transação"}
            </dd>
          </>
        )}
        {txRow}
      </dl>
      {explorerLink}
      {t?.txHash && (
        <details>
          <summary>Detalhes técnicos</summary>
          <dl className="kv">
            <dt>Rede</dt>
            <dd>Sepolia (testnet)</dd>
            <dt>Hash</dt>
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
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onHome}>
          Voltar ao início
        </button>
        <button type="button" className="btn" onClick={onNew}>
          {ok ? "Nova transferência" : "Tentar de novo"}
        </button>
      </div>
    </section>
  );
}
