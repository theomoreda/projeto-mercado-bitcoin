/**
 * Regras de valor (SPEC.md › Contas e valores). Tudo em bigint: o ledger guarda
 * centavos (2 casas) e o token usa micro-unidades (6 casas). Sem ponto flutuante.
 */
export type Cents = bigint;
export type Micro = bigint;

export const MICRO_PER_CENT = 10_000n;

export type AmountError = "vazio" | "invalido" | "zero_ou_negativo" | "saldo_insuficiente";

export type ParseResult =
  { ok: true; cents: Cents; truncated: boolean } | { ok: false; reason: AmountError };

const AMOUNT = /^(-?)(\d*)(?:[.,](\d+))?$/;

/**
 * Converte o texto digitado em centavos. Aceita "," ou "." como separador decimal,
 * trunca (nunca arredonda) para 2 casas e então valida contra o saldo disponível.
 * `truncated` avisa a interface de que casas além da segunda foram descartadas.
 */
export function parseAmount(input: string, availableCents: Cents): ParseResult {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "vazio" };

  const match = AMOUNT.exec(text);
  if (!match || (match[2] === "" && match[3] === undefined)) {
    return { ok: false, reason: "invalido" };
  }
  const [, sign, whole, fraction = ""] = match;

  const cents = BigInt(whole || "0") * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  if (sign === "-" || cents === 0n) return { ok: false, reason: "zero_ou_negativo" };
  if (cents > availableCents) return { ok: false, reason: "saldo_insuficiente" };

  return { ok: true, cents, truncated: fraction.length > 2 };
}

export const centsToMicro = (cents: Cents): Micro => cents * MICRO_PER_CENT;

/** Separa um valor on-chain em centavos inteiros e o excedente abaixo de 1 centavo. */
export function splitMicro(micro: Micro): { cents: Cents; excessMicro: Micro } {
  return { cents: micro / MICRO_PER_CENT, excessMicro: micro % MICRO_PER_CENT };
}

/** 123456n → "1.234,56" */
export function formatCents(cents: Cents): string {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `${whole},${fraction}`;
}

/** Saldo on-chain para exibição: trunca para centavos. */
export const formatMicro = (micro: Micro): string => formatCents(micro / MICRO_PER_CENT);
