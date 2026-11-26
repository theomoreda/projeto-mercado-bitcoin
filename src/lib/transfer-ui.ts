/** Textos e regras da tela de transferência (sem React, testável). Sem jargão de blockchain. */
import type { Direction, Status } from "../db/schema.ts";
import { parseAmount, type AmountError } from "./money.ts";

/** Corta o texto digitado em 2 casas decimais (nunca arredonda) e avisa se cortou. */
export function truncateInput(input: string): { text: string; truncated: boolean } {
  const m = /^(.*[.,]\d{2})\d+$/.exec(input);
  return m ? { text: m[1], truncated: true } : { text: input, truncated: false };
}

const AMOUNT_MESSAGES: Record<AmountError, string | null> = {
  vazio: null,
  invalido: "Use apenas números e vírgula, por exemplo 10,50.",
  zero_ou_negativo: "Informe um valor maior que zero.",
  saldo_insuficiente: "Saldo insuficiente para este valor.",
};

/** Mensagem de bloqueio para o valor digitado (RF-06), ou null se pode enviar/está vazio. */
export function amountError(input: string, availableCents: bigint): string | null {
  const r = parseAmount(input, availableCents);
  return r.ok ? null : AMOUNT_MESSAGES[r.reason];
}

const API_MESSAGES: Record<string, string> = {
  ...(Object.fromEntries(Object.entries(AMOUNT_MESSAGES).filter(([, v]) => v)) as Record<
    string,
    string
  >),
  servico_indisponivel: "Não foi possível concluir agora. Tente novamente em instantes.",
  carteira_nao_ativada: "Ative sua carteira antes de transferir.",
  rede_incorreta: "Sua carteira está em uma rede diferente. Recarregue a página.",
};

export function errorMessage(code: string): string {
  return API_MESSAGES[code] ?? "Algo deu errado. Tente novamente.";
}

export type StatusCopy = { title: string; detail?: string; tone: "muted" | "ok" | "error" };

export function statusCopy(t: { status: Status; direction: Direction }): StatusCopy {
  if (t.status === "PROCESSANDO") {
    return {
      title: "Processando…",
      detail: "Isso costuma levar menos de um minuto.",
      tone: "muted",
    };
  }
  if (t.status === "CONFIRMADA") return { title: "Transferência concluída", tone: "ok" };
  return {
    title: "Transferência não concluída",
    detail:
      t.direction === "MB_TO_WALLET"
        ? "O valor voltou para sua Conta MB."
        : "Nada saiu da sua carteira.",
    tone: "error",
  };
}

export const DIRECTION_LABEL: Record<Direction, string> = {
  MB_TO_WALLET: "Conta MB → Minha carteira",
  WALLET_TO_MB: "Minha carteira → Conta MB",
};
