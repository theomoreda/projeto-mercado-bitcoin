import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  numberToHex,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createChainCtx, type ChainCtx } from "../../src/lib/chain.ts";

// Contas padrão do Anvil (públicas, só para teste local).
export const KEYS = {
  treasury: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  user: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  other: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
} as const satisfies Record<string, Hex>;

const mintAbi = parseAbi(["function mint(address to, uint256 amount)"]);

export type TestChain = Awaited<ReturnType<typeof startChain>>;

/** Sobe um Anvil dedicado, implanta o MockUSDC e devolve o contexto de cadeia + utilitários. */
export async function startChain(port: number) {
  const proc: ChildProcess = spawn("anvil", ["--port", String(port), "--silent"], {
    stdio: "ignore",
  });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const transport = http(rpcUrl);
  const pub = createPublicClient({ chain: foundry, transport });
  for (let i = 0; ; i++) {
    try {
      await pub.getChainId();
      break;
    } catch {
      if (i > 50) throw new Error("anvil não subiu");
      await wait(100);
    }
  }

  const artifact = JSON.parse(readFileSync("contracts/out/MockUSDC.sol/MockUSDC.json", "utf8"));
  const treasury = privateKeyToAccount(KEYS.treasury);
  const deployer = createWalletClient({ account: treasury, chain: foundry, transport });
  const deployHash = await deployer.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [treasury.address],
  });
  const token = (await pub.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;

  const ctx: ChainCtx = await createChainCtx({
    rpcUrl,
    treasuryPrivateKey: KEYS.treasury,
    tokenAddress: token,
  });
  const testClient = createTestClient({ mode: "anvil", chain: foundry, transport });
  const user = createWalletClient({
    account: privateKeyToAccount(KEYS.user),
    chain: foundry,
    transport,
  });

  return {
    ctx,
    rpcUrl,
    token,
    pub,
    testClient,
    user,
    async mint(to: Address, amount: bigint) {
      const hash = await deployer.writeContract({
        address: token,
        abi: mintAbi,
        functionName: "mint",
        args: [to, amount],
      });
      await pub.waitForTransactionReceipt({ hash });
    },
    mine: (blocks: number) => testClient.mine({ blocks }),
    /** Fixa o saldo de Mock USDC direto no storage (OZ ERC20: mapping de saldos no slot 0). */
    async setTokenBalance(owner: Address, amount: bigint) {
      const slot = keccak256(
        encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner, 0n]),
      );
      await testClient.setStorageAt({
        address: token,
        index: slot,
        value: numberToHex(amount, { size: 32 }),
      });
    },
    stop: () => proc.kill(),
  };
}
