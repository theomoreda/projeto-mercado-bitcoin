/** Textos e regras da tela de transferência (sem React, testável). Sem jargão de blockchain. */
import type { Direction, Status } from "../db/schema.ts";
import { formatCents, parseAmount, type AmountError } from "./money.ts";

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
  // O envio saiu da carteira; a varredura credita assim que o servidor enxergar o tx.
  transacao_nao_encontrada: "Recebemos sua transferência. O saldo será atualizado em instantes.",
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

/** O texto tem mais de 2 casas decimais (o wireframe trata como erro, não como corte silencioso). */
export function hasTooManyDecimals(input: string): boolean {
  return /[.,]\d{3,}\s*$/.test(input.trim());
}

/**
 * Mensagem do campo de valor na tela de transferência (telas 08 e 09 do wireframe), ou null.
 * `source` é de onde sai o dinheiro, para dizer quanto a pessoa tem lá.
 */
export function amountFieldError(
  input: string,
  availableCents: bigint,
  source: "conta MB" | "sua wallet",
): string | null {
  if (hasTooManyDecimals(input)) {
    return `Use no máximo 2 casas decimais. Exemplo: ${truncateInput(input.trim()).text}`;
  }
  const r = parseAmount(input, availableCents);
  if (r.ok) return null;
  if (r.reason === "saldo_insuficiente") {
    return `Saldo insuficiente. Você tem ${formatCents(availableCents)} Mock USDC na ${source}.`;
  }
  return AMOUNT_MESSAGES[r.reason];
}

/** Erro ao assinar na carteira embutida (volta wallet → MB), em linguagem simples. */
export function walletErrorMessage(message: string): string {
  if (/insufficient funds/i.test(message)) {
    return "Sua wallet está sem Sepolia ETH para pagar a taxa de rede. Peça para abastecer a wallet de demonstração e tente de novo. Nada saiu da sua wallet.";
  }
  if (/reject|denied|cancel/i.test(message)) {
    return "Operação cancelada. Nada saiu da sua wallet.";
  }
  if (/chain|rede|network/i.test(message)) return API_MESSAGES.rede_incorreta;
  return "Não foi possível enviar da sua wallet agora. Nada saiu dela. Tente novamente.";
}

/** Motivo de falha legível (tela 14). */
export function failureReasonCopy(reason: string | null): string | null {
  if (!reason) return null;
  const map: Record<string, string> = {
    transacao_expirada: "Tempo de confirmação esgotado",
    transacao_substituida: "Tempo de confirmação esgotado",
    transacao_revertida: "A rede recusou a transação",
    transacao_nao_encontrada: "A rede não encontrou a transação a tempo",
    transferencia_invalida: "Transferência sem valor válido",
  };
  return map[reason] ?? "A rede não confirmou a transação";
}
