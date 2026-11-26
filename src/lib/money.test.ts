import { describe, expect, it } from "vitest";
import { centsToMicro, formatCents, formatMicro, parseAmount, splitMicro } from "./money.ts";

describe("parseAmount", () => {
  const saldo = 100_000n; // 1.000,00

  it.each([
    ["10", 1000n],
    ["10,5", 1050n],
    ["10.5", 1050n],
    ["0,01", 1n],
    [",5", 50n],
    ["  25,00 ", 2500n],
    ["1000", 100_000n],
  ])("aceita %j como %d centavos", (input, cents) => {
    expect(parseAmount(input, saldo)).toEqual({ ok: true, cents, truncated: false });
  });

  it("trunca (nunca arredonda) para 2 casas e sinaliza", () => {
    expect(parseAmount("10,999", saldo)).toEqual({ ok: true, cents: 1099n, truncated: true });
    expect(parseAmount("0,019", saldo)).toEqual({ ok: true, cents: 1n, truncated: true });
  });

  it.each([
    ["", "vazio"],
    ["   ", "vazio"],
    ["abc", "invalido"],
    ["1.000,00", "invalido"],
    ["1e3", "invalido"],
    ["10,", "invalido"],
    ["0", "zero_ou_negativo"],
    ["0,00", "zero_ou_negativo"],
    ["0,009", "zero_ou_negativo"],
    ["-1", "zero_ou_negativo"],
    ["1000,01", "saldo_insuficiente"],
  ])("rejeita %j com motivo %s", (input, reason) => {
    expect(parseAmount(input, saldo)).toEqual({ ok: false, reason });
  });
});

describe("conversões", () => {
  it("centavos → micro-unidades do token (6 casas)", () => {
    expect(centsToMicro(1099n)).toBe(10_990_000n);
  });

  it("separa micro-unidades em centavos e excedente", () => {
    expect(splitMicro(1_234_567n)).toEqual({ cents: 123n, excessMicro: 4567n });
    expect(splitMicro(10_000n)).toEqual({ cents: 1n, excessMicro: 0n });
  });
});

describe("formatação pt-BR", () => {
  it.each([
    [0n, "0,00"],
    [5n, "0,05"],
    [100_000n, "1.000,00"],
    [123_456_789n, "1.234.567,89"],
  ])("formatCents(%d) = %s", (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it("formatMicro trunca para centavos", () => {
    expect(formatMicro(1_234_567n)).toBe("1,23");
  });
});
