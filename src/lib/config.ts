import { parseAmount } from "./money.ts";

/** Configuração do servidor (variáveis de ambiente), lida sob demanda. */
export function serverConfig() {
  const initial = parseAmount(process.env.INITIAL_BALANCE ?? "1000.00", 10n ** 15n);
  if (!initial.ok) throw new Error("INITIAL_BALANCE inválido");
  return {
    demoEmails: (process.env.DEMO_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    initialCents: initial.cents,
    confirmations: BigInt(process.env.CONFIRMATIONS ?? "2"),
    observationWindowMs: Number(process.env.OBSERVATION_WINDOW_MIN ?? "10") * 60_000,
    // Tamanho da janela de eth_getLogs: RPCs gratuitos limitam a faixa de blocos por chamada.
    scanChunkBlocks: BigInt(process.env.SCAN_CHUNK_BLOCKS ?? "500"),
  };
}

export type ServerConfig = ReturnType<typeof serverConfig>;
