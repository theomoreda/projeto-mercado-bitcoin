/**
 * Único módulo que fala com a blockchain (SPEC.md › Arquitetura). Tesouraria assina
 * MB → wallet no servidor; leituras de recibo, saldo e eventos para os dois sentidos.
 */
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  parseAbi,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

export type ChainCtx = {
  publicClient: PublicClient;
  treasury: PrivateKeyAccount;
  token: Address;
  chainId: number;
};

export async function createChainCtx(cfg: {
  rpcUrl: string;
  treasuryPrivateKey: Hex;
  tokenAddress: Address;
}): Promise<ChainCtx> {
  const publicClient = createPublicClient({ transport: http(cfg.rpcUrl) });
  return {
    publicClient,
    treasury: privateKeyToAccount(cfg.treasuryPrivateKey),
    token: cfg.tokenAddress,
    chainId: await publicClient.getChainId(),
  };
}

let shared: Promise<ChainCtx> | undefined;

/** Contexto único por processo, a partir de RPC_URL, TREASURY_PRIVATE_KEY e NEXT_PUBLIC_TOKEN_ADDRESS. */
export function getChain(): Promise<ChainCtx> {
  shared ??= createChainCtx({
    rpcUrl: process.env.RPC_URL!,
    treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY as Hex,
    tokenAddress: process.env.NEXT_PUBLIC_TOKEN_ADDRESS as Address,
  }).catch((err) => {
    shared = undefined;
    throw err;
  });
  return shared;
}

export type SignedTx = { txHash: Hex; nonce: bigint; rawTx: Hex };

/**
 * Assina (sem transmitir) um `transfer` de Mock USDC da tesouraria. O hash sai daqui,
 * antes do broadcast, para ser gravado no ledger junto com a reserva.
 */
export async function signTreasuryTransfer(
  ctx: ChainCtx,
  to: Address,
  amountMicro: bigint,
  opts: { gas?: bigint } = {},
): Promise<SignedTx> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amountMicro],
  });
  return signTreasuryTx(ctx, { to: ctx.token, data, gas: opts.gas });
}

async function signTreasuryTx(
  ctx: ChainCtx,
  tx: { to: Address; data?: Hex; gas?: bigint; nonce?: number; feeBump?: bigint },
): Promise<SignedTx> {
  const pc = ctx.publicClient;
  const [nonce, fees, gas] = await Promise.all([
    tx.nonce ?? pc.getTransactionCount({ address: ctx.treasury.address, blockTag: "pending" }),
    pc.estimateFeesPerGas(),
    tx.gas ?? pc.estimateGas({ account: ctx.treasury.address, to: tx.to, data: tx.data }),
  ]);
  const bump = tx.feeBump ?? 1n;
  const rawTx = await ctx.treasury.signTransaction({
    chainId: ctx.chainId,
    type: "eip1559",
    to: tx.to,
    data: tx.data,
    value: 0n,
    nonce,
    gas,
    maxFeePerGas: fees.maxFeePerGas * bump,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas * bump,
  });
  return { txHash: keccak256(rawTx), nonce: BigInt(nonce), rawTx };
}

const ALREADY_SEEN = /already known|already imported|known transaction|nonce too low/i;

/**
 * Transmite um tx já assinado. Retransmitir é seguro: se o nó já conhece o tx ou o
 * nonce já foi usado, não há o que fazer aqui; `getTxStatus` decide o desfecho.
 */
export async function broadcast(ctx: ChainCtx, rawTx: Hex): Promise<void> {
  try {
    await ctx.publicClient.sendRawTransaction({ serializedTransaction: rawTx });
  } catch (err) {
    if (!ALREADY_SEEN.test(String((err as Error).message))) throw err;
  }
}

export type TxStatus =
  | { kind: "unknown" }
  | { kind: "pending" }
  | { kind: "mined"; success: boolean; confirmations: bigint; logs: Log[] };

export async function getTxStatus(ctx: ChainCtx, hash: Hex): Promise<TxStatus> {
  const pc = ctx.publicClient;
  try {
    const receipt = await pc.getTransactionReceipt({ hash });
    const latest = await pc.getBlockNumber({ cacheTime: 0 });
    return {
      kind: "mined",
      success: receipt.status === "success",
      confirmations: latest - receipt.blockNumber + 1n,
      logs: receipt.logs,
    };
  } catch (err) {
    if (!(err instanceof TransactionReceiptNotFoundError)) throw err;
  }
  try {
    await pc.getTransaction({ hash });
    return { kind: "pending" };
  } catch (err) {
    if (err instanceof TransactionNotFoundError) return { kind: "unknown" };
    throw err;
  }
}

/** O nonce da tesouraria já foi usado por um tx minerado (o nosso ou um substituto)? */
export async function isNonceConsumed(ctx: ChainCtx, nonce: bigint): Promise<boolean> {
  const mined = await ctx.publicClient.getTransactionCount({
    address: ctx.treasury.address,
    blockTag: "latest",
  });
  return BigInt(mined) > nonce;
}

export function tokenBalance(ctx: ChainCtx, owner: Address): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: ctx.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

/** Transfers de Mock USDC `from` → tesouraria, numa faixa de blocos (inclusive). */
export async function findInboundTransfers(
  ctx: ChainCtx,
  from: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ txHash: Hex; amountMicro: bigint }[]> {
  const logs = await ctx.publicClient.getContractEvents({
    address: ctx.token,
    abi: erc20Abi,
    eventName: "Transfer",
    args: { from, to: ctx.treasury.address },
    fromBlock,
    toBlock,
  });
  return logs.map((l) => ({ txHash: l.transactionHash, amountMicro: l.args.value! }));
}

const mintAbi = parseAbi(["function mint(address to, uint256 amount)"]);

/** Emite Mock USDC para a tesouraria até `targetMicro`. Devolve quanto foi emitido. */
export async function seedTreasury(ctx: ChainCtx, targetMicro: bigint): Promise<bigint> {
  const missing = targetMicro - (await tokenBalance(ctx, ctx.treasury.address));
  if (missing <= 0n) return 0n;
  const data = encodeFunctionData({
    abi: mintAbi,
    functionName: "mint",
    args: [ctx.treasury.address, missing],
  });
  const signed = await signTreasuryTx(ctx, { to: ctx.token, data });
  await broadcast(ctx, signed.rawTx);
  await ctx.publicClient.waitForTransactionReceipt({ hash: signed.txHash });
  return missing;
}
