import { describe, expect, it } from "vitest";
import { decodeTransfer, encodeTransfer } from "./erc20.ts";

const TREASURY = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("calldata de transfer(address,uint256)", () => {
  it("codifica com o seletor padrão do ERC-20", () => {
    const data = encodeTransfer(TREASURY, 10_500_000n);
    expect(data.slice(0, 10)).toBe("0xa9059cbb");
    expect(data).toHaveLength(2 + 8 + 64 * 2);
  });

  it("ida e volta preserva destino e valor", () => {
    expect(decodeTransfer(encodeTransfer(TREASURY, 1_234_567n))).toEqual({
      to: TREASURY,
      amountMicro: 1_234_567n,
    });
  });

  it("calldata que não é transfer → null", () => {
    expect(decodeTransfer("0x")).toBeNull();
    expect(decodeTransfer(`0x095ea7b3${"0".repeat(128)}`)).toBeNull(); // approve
  });
});
