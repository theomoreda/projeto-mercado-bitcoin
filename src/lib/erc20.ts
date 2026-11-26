import { decodeFunctionData, encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";

/** Calldata de `transfer(to, amount)` do Mock USDC (usado no navegador para wallet → MB). */
export function encodeTransfer(to: Address, amountMicro: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amountMicro] });
}

/** Lê destino e valor de um calldata de `transfer`; null se for outra chamada. */
export function decodeTransfer(data: Hex): { to: Address; amountMicro: bigint } | null {
  try {
    const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data });
    if (functionName !== "transfer") return null;
    const [to, amountMicro] = args;
    return { to, amountMicro };
  } catch {
    return null;
  }
}
