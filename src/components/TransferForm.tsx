"use client";

import { useId, useRef, useState } from "react";
import type { Direction } from "@/db/schema";
import { formatCents, MICRO_PER_CENT, parseAmount } from "@/lib/money";
import { amountFieldError, DIRECTION_LABEL } from "@/lib/transfer-ui";
import type { MeView } from "@/lib/types";
import { NetworkWarning, useSepoliaWallet } from "./NetworkGuard";
import { shortAddress } from "./WalletCard";

export type Draft = {
  direction: Direction;
  amountText: string;
  cents: bigint;
  /** Um id por intenção de envio: duplo clique ou reenvio não duplicam a transferência. */
  requestId: string;
};

const DIRECTIONS: Direction[] = ["MB_TO_WALLET", "WALLET_TO_MB"];
const SHORT_LABEL: Record<Direction, string> = {
  MB_TO_WALLET: "Conta MB → Wallet",
  WALLET_TO_MB: "Wallet → Conta MB",
};

type Props = {
  me: MeView;
  busy: boolean;
  initial: Draft | null;
  onBack: () => void;
  onContinue: (d: Draft) => void;
};

/** Telas 07–10: escolher o sentido e o valor, com os erros de valor visíveis no campo. */
export function TransferForm({ me, busy, initial, onBack, onContinue }: Props) {
  const { wrongNetwork } = useSepoliaWallet();
  const [direction, setDirection] = useState<Direction>(initial?.direction ?? "MB_TO_WALLET");
  const [amount, setAmount] = useState(initial?.amountText ?? "");
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const errorId = useId();
  const hintId = useId();

  const accountCents = BigInt(me.account.availableCents);
  const walletCents = BigInt(me.wallet?.balanceMicro ?? "0") / MICRO_PER_CENT;
  const toWallet = direction === "MB_TO_WALLET";
  const available = toWallet ? accountCents : walletCents;
  const error = amountFieldError(amount, available, toWallet ? "conta MB" : "sua wallet");
  const parsed = parseAmount(amount, available);
  const blockedByNetwork = !toWallet && wrongNetwork;
  const canContinue = !busy && !error && parsed.ok && !blockedByNetwork;
  const address = me.wallet ? shortAddress(me.wallet.address) : "";

  function pick(d: Direction) {
    setDirection(d);
  }

  /** Setas mudam a opção, como num grupo de rádio nativo. */
  function onRadioKey(e: React.KeyboardEvent, i: number) {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + DIRECTIONS.length) % DIRECTIONS.length;
    pick(DIRECTIONS[next]);
    radios.current[next]?.focus();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue || !parsed.ok) return;
    const sameIntent =
      initial && initial.direction === direction && initial.amountText === amount.trim();
    onContinue({
      direction,
      amountText: amount.trim(),
      cents: parsed.cents,
      requestId: sameIntent ? initial.requestId : crypto.randomUUID(),
    });
  }

  const from = toWallet
    ? { name: "Conta MB", detail: `Custodial · disponível ${formatCents(accountCents)}` }
    : { name: "Minha wallet", detail: `${address} · disponível ${formatCents(walletCents)}` };
  const to = toWallet
    ? { name: "Minha wallet", detail: `${address} · saldo ${formatCents(walletCents)}` }
    : { name: "Conta MB", detail: `Custodial · saldo ${formatCents(accountCents)}` };

  return (
    <>
      <button type="button" className="back" onClick={onBack}>
        ← Voltar ao início
      </button>
      <h1>Transferir Mock USDC</h1>
      <div className="grid-transfer">
        <form className="card" onSubmit={submit} noValidate aria-labelledby="form-title">
          <h2 id="form-title" className="sr-only">
            Dados da transferência
          </h2>
          <div className="segmented" role="radiogroup" aria-label="Sentido da transferência">
            {DIRECTIONS.map((d, i) => (
              <button
                key={d}
                ref={(el) => {
                  radios.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={direction === d}
                aria-label={DIRECTION_LABEL[d]}
                tabIndex={direction === d ? 0 : -1}
                onClick={() => pick(d)}
                onKeyDown={(e) => onRadioKey(e, i)}
              >
                {SHORT_LABEL[d]}
              </button>
            ))}
          </div>

          <dl className="route">
            <div className="route-row">
              <dt>De</dt>
              <dd>
                <strong>{from.name}</strong>
                <span className="muted">{from.detail}</span>
              </dd>
            </div>
            <div className="route-row">
              <dt>Para</dt>
              <dd>
                <strong>{to.name}</strong>
                <span className="muted">{to.detail}</span>
              </dd>
            </div>
          </dl>

          <div className="field">
            <label htmlFor="amount">Valor</label>
            <div className={`amount-input${error ? " invalid" : ""}`}>
              <input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={amount}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : hintId}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span aria-hidden="true">Mock USDC</span>
            </div>
            {error ? (
              <p id={errorId} className="field-error" role="alert">
                {error}
              </p>
            ) : (
              <p id={hintId} className="muted">
                Disponível: {formatCents(available)} Mock USDC ·{" "}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setAmount(formatCents(available).replace(/\./g, ""))}
                >
                  Usar máximo
                </button>
              </p>
            )}
          </div>

          <dl className="summary">
            <dt>Rede</dt>
            <dd>Sepolia (rede de teste)</dd>
            <dt>Taxa de rede</dt>
            <dd>
              {toWallet ? "Paga pelo MB na demonstração" : "Paga em Sepolia ETH pela sua wallet"}
            </dd>
          </dl>

          {!toWallet && (
            <p className="muted">
              Você vai confirmar a operação com a sua wallet. O Sepolia ETH da taxa já foi
              abastecido para a demonstração.
            </p>
          )}
          {wrongNetwork && <NetworkWarning />}

          <button type="submit" className="btn btn-block" disabled={!canContinue}>
            Continuar
          </button>
        </form>

        <aside className="card" aria-labelledby="bom-saber">
          <h2 id="bom-saber">Bom saber</h2>
          <ul className="bullets">
            <li>Os saldos só mudam depois que a rede confirma a operação.</li>
            <li>Use no máximo 2 casas decimais.</li>
            <li>Sepolia é uma rede de teste: os tokens não têm valor real.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
