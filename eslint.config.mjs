import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // RNF-03: nenhum ponto flutuante no caminho do saldo.
    files: [
      "src/lib/money.ts",
      "src/lib/ledger.ts",
      "src/lib/transfers.ts",
      "src/lib/reconcile.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Valores de saldo são bigint (RNF-03)." },
        { name: "parseInt", message: "Use BigInt() para valores de saldo (RNF-03)." },
        { name: "Number", message: "Valores de saldo são bigint (RNF-03)." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", message: "Valores de saldo são bigint (RNF-03)." },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "contracts/**"]),
]);

export default eslintConfig;
