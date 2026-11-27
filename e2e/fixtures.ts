import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route } from "@playwright/test";
import type { E2EScenario } from "../src/components/auth/MockAuth";
import type { MeView, TransferView } from "../src/lib/types";

export const WALLET = `0x7a3F${"0".repeat(32)}9c2B`;
export const DEPOSIT = `0x${"d".repeat(40)}`;
export const TX_OUT = `0x9f2c${"0".repeat(56)}e41a`;
export const TX_IN = `0x3b7d${"0".repeat(56)}a90f`;

export function me(opts: { cents?: number; wallet?: boolean; walletCents?: number } = {}): MeView {
  const walletMicro = BigInt(opts.walletCents ?? 0) * 10_000n;
  return {
    email: "demo@mbbridge.dev",
    account: { availableCents: String(opts.cents ?? 100_000), reservedCents: "0" },
    wallet: opts.wallet
      ? { address: WALLET, balanceMicro: walletMicro.toString(), mbDepositAddress: DEPOSIT }
      : null,
  };
}

export function transfer(over: Partial<TransferView> = {}): TransferView {
  return {
    id: "6f0c1d2e-0000-4000-8000-000000000001",
    direction: "MB_TO_WALLET",
    status: "PROCESSANDO",
    amountMicro: "250000000",
    txHash: TX_OUT,
    failureReason: null,
    confirmations: "0",
    ...over,
  };
}

/** Prepara o login simulado antes de a página carregar. */
export async function scenario(page: Page, s: E2EScenario) {
  await page.addInitScript((sc) => {
    window.__MB_E2E__ = sc;
  }, s);
}

export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Screenshot de página inteira a 1440px, para comparar com o Figma. */
export async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  // Esconde o indicador do modo dev do Next e tira o mouse de cima dos links.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `e2e/__screenshots__/${name}.png`, fullPage: true });
}

/** Sem violações sérias ou críticas de acessibilidade (WCAG 2.1 A/AA). */
export async function expectAccessible(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

/** Alertas do app (o Next tem um anunciador de rota com role="alert" que fica vazio). */
export const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
