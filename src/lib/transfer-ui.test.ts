import { describe, expect, it } from "vitest";
import { amountError, errorMessage, statusCopy, truncateInput } from "./transfer-ui.ts";

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
