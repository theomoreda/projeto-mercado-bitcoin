import { erc20Abi } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  broadcast,
  findInboundTransfers,
  getTxStatus,
  isNonceConsumed,
  seedTreasury,
  signTreasuryTransfer,
  tokenBalance,
} from "../../src/lib/chain.ts";
import { startChain, type TestChain } from "./anvil.ts";

let c: TestChain;
const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const; // conta 1 do Anvil

beforeAll(async () => {
  c = await startChain(8547);
  await c.mint(c.ctx.treasury.address, 1_000_000_000n);
});
afterAll(() => c?.stop());

describe("tesouraria → wallet", () => {
  it("o hash calculado antes do broadcast é o hash minerado", async () => {
    const signed = await signTreasuryTransfer(c.ctx, USER, 10_000_000n);
    expect(await getTxStatus(c.ctx, signed.txHash)).toEqual({ kind: "unknown" });
    await broadcast(c.ctx, signed.rawTx);
    const receipt = await c.pub.waitForTransactionReceipt({ hash: signed.txHash });
    expect(receipt.status).toBe("success");
    expect(await tokenBalance(c.ctx, USER)).toBe(10_000_000n);
  });

  it("retransmitir o mesmo tx não gera um segundo envio", async () => {
    const before = await tokenBalance(c.ctx, USER);
    const signed = await signTreasuryTransfer(c.ctx, USER, 1_000_000n);
    await broadcast(c.ctx, signed.rawTx);
    await c.pub.waitForTransactionReceipt({ hash: signed.txHash });
    await broadcast(c.ctx, signed.rawTx); // já minerado: não lança, não duplica
    expect(await tokenBalance(c.ctx, USER)).toBe(before + 1_000_000n);
    expect(await isNonceConsumed(c.ctx, signed.nonce)).toBe(true);
  });

  it("conta confirmações a partir do bloco do recibo", async () => {
    const signed = await signTreasuryTransfer(c.ctx, USER, 1n);
    await broadcast(c.ctx, signed.rawTx);
    await c.pub.waitForTransactionReceipt({ hash: signed.txHash });
    expect(await getTxStatus(c.ctx, signed.txHash)).toMatchObject({
      kind: "mined",
      success: true,
      confirmations: 1n,
    });
    await c.mine(2);
    expect(await getTxStatus(c.ctx, signed.txHash)).toMatchObject({ confirmations: 3n });
  });

  it("detecta transação revertida", async () => {
    const tooMuch = (await tokenBalance(c.ctx, c.ctx.treasury.address)) + 1n;
    const signed = await signTreasuryTransfer(c.ctx, USER, tooMuch, { gas: 100_000n });
    await broadcast(c.ctx, signed.rawTx);
    await c.pub.waitForTransactionReceipt({ hash: signed.txHash });
    expect(await getTxStatus(c.ctx, signed.txHash)).toMatchObject({
      kind: "mined",
      success: false,
    });
  });

  it("reconhece tx pendente (mempool) antes de minerar", async () => {
    await c.testClient.setAutomine(false);
    const signed = await signTreasuryTransfer(c.ctx, USER, 1n);
    await broadcast(c.ctx, signed.rawTx);
    expect(await getTxStatus(c.ctx, signed.txHash)).toEqual({ kind: "pending" });
    expect(await isNonceConsumed(c.ctx, signed.nonce)).toBe(false);
    await c.mine(1);
    await c.testClient.setAutomine(true);
    expect(await getTxStatus(c.ctx, signed.txHash)).toMatchObject({ kind: "mined" });
  });
});

describe("wallet → tesouraria", () => {
  it("encontra os Transfer da wallet para a tesouraria numa faixa de blocos", async () => {
    const from = await c.pub.getBlockNumber({ cacheTime: 0 });
    const hash = await c.user.writeContract({
      address: c.token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [c.ctx.treasury.address, 1_234_567n],
    });
    await c.pub.waitForTransactionReceipt({ hash });
    const found = await findInboundTransfers(c.ctx, USER, from, await c.pub.getBlockNumber({ cacheTime: 0 }));
    expect(found).toEqual([{ txHash: hash, amountMicro: 1_234_567n }]);
  });
});

describe("seedTreasury", () => {
  it("emite só o que falta para chegar ao alvo", async () => {
    const target = (await tokenBalance(c.ctx, c.ctx.treasury.address)) + 5_000_000n;
    expect(await seedTreasury(c.ctx, target)).toBe(5_000_000n);
    expect(await seedTreasury(c.ctx, target)).toBe(0n);
    expect(await tokenBalance(c.ctx, c.ctx.treasury.address)).toBe(target);
  });
});
