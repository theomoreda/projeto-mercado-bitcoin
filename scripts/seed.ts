// Emite Mock USDC para a tesouraria: DEMO_EMAILS × INITIAL_BALANCE (lastro do saldo custodial).
import "./env.ts";
import { formatEther } from "viem";
import { getChain, seedTreasury, tokenBalance } from "../src/lib/chain.ts";
import { serverConfig } from "../src/lib/config.ts";
import { centsToMicro, formatMicro } from "../src/lib/money.ts";

const config = serverConfig();
if (config.demoEmails.length === 0) throw new Error("Defina DEMO_EMAILS em .env.local");

const ctx = await getChain();
const target = centsToMicro(config.initialCents) * BigInt(config.demoEmails.length);
const minted = await seedTreasury(ctx, target);
const eth = await ctx.publicClient.getBalance({ address: ctx.treasury.address });

console.log(`Tesouraria ${ctx.treasury.address}`);
console.log(`  emitido agora: ${formatMicro(minted)} USDC`);
console.log(`  saldo:         ${formatMicro(await tokenBalance(ctx, ctx.treasury.address))} USDC`);
console.log(`  ETH p/ taxas:  ${formatEther(eth)}`);
