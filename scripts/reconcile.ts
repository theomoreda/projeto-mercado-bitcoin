// Confere as invariantes de saldo (RNF-04). Sai com código 1 se houver diferença.
import "./env.ts";
import { appDeps } from "../src/lib/deps.ts";
import { formatMicro } from "../src/lib/money.ts";
import { reconcile } from "../src/lib/reconcile.ts";

const fmt = (micro: bigint) =>
  `${micro < 0n ? "-" : ""}${formatMicro(micro < 0n ? -micro : micro)} USDC (${micro} micro)`;

const r = await reconcile(appDeps());
for (const a of r.accounts) {
  console.log(`Conta ${a.email}`);
  console.log(`  custodial ${fmt(a.custodialMicro)} + carteira ${fmt(a.walletMicro)}`);
  console.log(`  em trânsito ${fmt(a.inTransitMicro)} · inicial ${fmt(a.initialMicro)}`);
  console.log(`  ${a.diffMicro === 0n ? "ok" : `DIFERENÇA ${fmt(a.diffMicro)}`}`);
}
if (r.treasury) {
  const t = r.treasury;
  console.log(`Tesouraria ${t.address}`);
  console.log(`  on-chain ${fmt(t.onchainMicro)} · esperado ${fmt(t.expectedMicro)}`);
  console.log(`  ${t.diffMicro === 0n ? "ok" : `DIFERENÇA ${fmt(t.diffMicro)}`}`);
}
console.log(r.ok ? "Tudo confere." : "Há diferenças: investigue antes de continuar.");
process.exit(r.ok ? 0 : 1);
