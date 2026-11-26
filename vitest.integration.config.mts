import { defineConfig } from "vitest/config";
import base from "./vitest.config.mjs";

// Integração: Postgres real (docker compose) e Anvil. Banco próprio de teste, nunca o de desenvolvimento.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://mb:mb@127.0.0.1:5433/mb_wallet_bridge_test";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
