import { describe, expect, it } from "vitest";
import { assertTestnet, isAlreadySeen } from "./chain.ts";

describe("assertTestnet", () => {
  it("aceita Sepolia e Anvil local", () => {
    expect(() => assertTestnet(11155111)).not.toThrow();
    expect(() => assertTestnet(31337)).not.toThrow();
  });

  it.each([1, 137, 8453])("recusa a rede %d (mainnet ou outra rede real)", (id) => {
    expect(() => assertTestnet(id)).toThrow(/Sepolia/);
  });
});

describe("isAlreadySeen (retransmissão de um tx idêntico)", () => {
  it.each([
    "already known",
    "transaction already imported",
    "nonce too low",
    "replacement transaction underpriced", // Alchemy/Sepolia com o mesmo tx no mempool
  ])("trata %j como inofensivo", (msg) => {
    expect(isAlreadySeen(`Details: ${msg}`)).toBe(true);
  });

  it("não engole erros reais", () => {
    expect(isAlreadySeen("insufficient funds for gas * price + value")).toBe(false);
  });
});
