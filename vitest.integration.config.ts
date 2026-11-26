import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// Integração: Postgres real (docker compose) e Anvil. Roda em série para não disputar o banco.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["tests/integration/**/*.test.ts"],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  }),
);
