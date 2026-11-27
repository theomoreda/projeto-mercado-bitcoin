import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * E2E camada 1: o app de verdade no navegador, sem rede. O login da Privy é trocado pelo
 * `MockAuth` (NEXT_PUBLIC_E2E_MOCK_AUTH=1, só fora de produção) e cada teste simula `/api/*`
 * com `page.route`. Screenshots a 1440×900, o tamanho das telas do wireframe no Figma.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    trace: "off",
  },
  webServer: {
    command: `npx next dev -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_E2E_MOCK_AUTH: "1",
      NEXT_PUBLIC_TOKEN_ADDRESS: "0x1111111111111111111111111111111111111111",
      NEXT_PUBLIC_EXPLORER_URL: "https://sepolia.etherscan.io",
    },
  },
});
