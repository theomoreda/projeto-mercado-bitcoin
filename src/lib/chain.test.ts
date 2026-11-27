import { describe, expect, it } from "vitest";
import { assertTestnet } from "./chain.ts";

describe("assertTestnet", () => {
  it("aceita Sepolia e Anvil local", () => {
    expect(() => assertTestnet(11155111)).not.toThrow();
    expect(() => assertTestnet(31337)).not.toThrow();
  });

  it.each([1, 137, 8453])("recusa a rede %d (mainnet ou outra rede real)", (id) => {
    expect(() => assertTestnet(id)).toThrow(/Sepolia/);
  });
});
