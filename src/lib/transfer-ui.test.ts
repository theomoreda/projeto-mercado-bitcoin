import { describe, expect, it } from "vitest";
import {
  amountError,
  amountFieldError,
  errorMessage,
  failureReasonCopy,
  hasTooManyDecimals,
  statusCopy,
  truncateInput,
  walletErrorMessage,
} from "./transfer-ui.ts";

describe("truncateInput", () => {
  it.each([
    ["10,99", "10,99", false],
    ["10,999", "10,99", true],
    ["0.019", "0.01", true],
    ["abc", "abc", false],
    ["", "", false],
  ])("%j → %j (truncou: %s)", (input, text, truncated) => {
    expect(truncateInput(input)).toEqual({ text, truncated });
  });
});

describe("amountError", () => {
  it("explica cada bloqueio de RF-06 em linguagem simples", () => {
    expect(amountError("0", 100n)).toBe("Informe um valor maior que zero.");
    expect(amountError("-5", 100n)).toBe("Informe um valor maior que zero.");
    expect(amountError("2", 100n)).toBe("Saldo insuficiente para este valor.");
    expect(amountError("1,2,3", 100n)).toBe("Use apenas números e vírgula, por exemplo 10,50.");
    expect(amountError("", 100n)).toBeNull(); // campo vazio: só desabilita o botão
    expect(amountError("1", 100n)).toBeNull();
  });
});

describe("statusCopy", () => {
  it("processando", () => {
    expect(statusCopy({ status: "PROCESSANDO", direction: "MB_TO_WALLET" })).toMatchObject({
      title: "Processando…",
      tone: "muted",
    });
  });

  it("concluída", () => {
    expect(statusCopy({ status: "CONFIRMADA", direction: "WALLET_TO_MB" })).toMatchObject({
      title: "Transferência concluída",
      tone: "ok",
    });
  });

  it("falha na ida avisa que o valor voltou para a Conta MB (RF-10)", () => {
    expect(statusCopy({ status: "FALHOU", direction: "MB_TO_WALLET" })).toEqual({
      title: "Transferência não concluída",
      detail: "O valor voltou para sua Conta MB.",
      tone: "error",
    });
  });

  it("falha na volta avisa que o valor continua na carteira", () => {
    expect(statusCopy({ status: "FALHOU", direction: "WALLET_TO_MB" }).detail).toBe(
      "Nada saiu da sua carteira.",
    );
  });

  it("volta sem recibo não diz que nada saiu: o crédito ainda pode chegar (PR #2)", () => {
    const copy = statusCopy({
      status: "FALHOU",
      direction: "WALLET_TO_MB",
      failureReason: "transacao_nao_encontrada",
    });
    expect(copy.detail).toBe(
      "Se ela aparecer na rede depois, o valor entra na sua Conta MB automaticamente.",
    );
    expect(copy.detail).not.toMatch(/Nada saiu/);
  });

  it("volta revertida continua dizendo que nada saiu da carteira", () => {
    expect(
      statusCopy({
        status: "FALHOU",
        direction: "WALLET_TO_MB",
        failureReason: "transacao_revertida",
      }).detail,
    ).toBe("Nada saiu da sua carteira.");
  });
});

describe("errorMessage", () => {
  it("traduz códigos da API e cai num texto genérico para o resto", () => {
    expect(errorMessage("saldo_insuficiente")).toBe("Saldo insuficiente para este valor.");
    expect(errorMessage("servico_indisponivel")).toBe(
      "Não foi possível concluir agora. Tente novamente em instantes.",
    );
    expect(errorMessage("qualquer_coisa")).toBe("Algo deu errado. Tente novamente.");
    expect(errorMessage("transacao_nao_encontrada")).toMatch(/atualizado em instantes/);
  });
});

describe("amountFieldError (telas 08 e 09 do wireframe)", () => {
  it("mais de 2 casas é erro visível, com exemplo truncado (nunca arredondado)", () => {
    expect(hasTooManyDecimals("10,555")).toBe(true);
    expect(hasTooManyDecimals("10,55")).toBe(false);
    expect(amountFieldError("10,555", 100_000n, "conta MB")).toBe(
      "Use no máximo 2 casas decimais. Exemplo: 10,55",
    );
    expect(amountFieldError("0.019", 100_000n, "conta MB")).toBe(
      "Use no máximo 2 casas decimais. Exemplo: 0.01",
    );
  });

  it("saldo insuficiente diz quanto a pessoa tem na origem", () => {
    expect(amountFieldError("1500", 100_000n, "conta MB")).toBe(
      "Saldo insuficiente. Você tem 1.000,00 Mock USDC na conta MB.",
    );
    expect(amountFieldError("300", 25_000n, "sua wallet")).toBe(
      "Saldo insuficiente. Você tem 250,00 Mock USDC na sua wallet.",
    );
  });

  it("mantém as mensagens de RF-06 para o resto", () => {
    expect(amountFieldError("0", 100n, "conta MB")).toBe("Informe um valor maior que zero.");
    expect(amountFieldError("", 100n, "conta MB")).toBeNull();
    expect(amountFieldError("1", 100n, "conta MB")).toBeNull();
  });
});

describe("walletErrorMessage", () => {
  it("falta de Sepolia ETH vira mensagem legível, não 'Algo deu errado'", () => {
    expect(walletErrorMessage("insufficient funds for gas * price + value")).toMatch(
      /sem Sepolia ETH/,
    );
    expect(walletErrorMessage("User rejected the request.")).toMatch(/cancelada/);
    expect(walletErrorMessage("boom")).toMatch(/Nada saiu dela/);
  });
});

describe("failureReasonCopy", () => {
  it("traduz o motivo gravado no ledger", () => {
    expect(failureReasonCopy("transacao_expirada")).toBe("Tempo de confirmação esgotado");
    expect(failureReasonCopy("outro")).toBe("A rede não confirmou a transação");
    expect(failureReasonCopy(null)).toBeNull();
  });
});

describe("errorMessage com os códigos novos da API", () => {
  it("pedido inválido e conflitante têm texto próprio", () => {
    expect(errorMessage("pedido_invalido")).toMatch(/Não entendemos/);
    expect(errorMessage("pedido_conflitante")).toMatch(/outros dados/);
  });
});
