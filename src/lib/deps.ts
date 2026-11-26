import type { Address } from "viem";
import { getDb, type Executor } from "../db/index.ts";
import { privyVerifier, privyWalletLookup, type Verifier } from "./auth.ts";
import { getChain, type ChainCtx } from "./chain.ts";
import { serverConfig, type ServerConfig } from "./config.ts";

/** Tudo de que os handlers de /api precisam; os testes injetam versões falsas. */
export type AppDeps = {
  db: Executor;
  verify: Verifier;
  /** Carteira embutida (Privy) do usuário, consultada no servidor — nunca informada pelo cliente. */
  lookupWallet: (privyUserId: string) => Promise<Address | null>;
  config: ServerConfig;
  chain: () => Promise<ChainCtx>;
};

export function appDeps(): AppDeps {
  return {
    db: getDb(),
    verify: privyVerifier,
    lookupWallet: privyWalletLookup,
    config: serverConfig(),
    chain: getChain,
  };
}
