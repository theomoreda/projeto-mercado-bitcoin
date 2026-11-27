import { parseAmount } from "./money.ts";

/** Inteiro decimal ≥ 1 (CONFIRMATIONS=0 creditaria sem confirmação; "abc" viraria NaN/erro tardio). */
function positiveInt(name: string, fallback: string): bigint {
  const raw = (process.env[name] ?? fallback).trim();
  if (!/^\d+$/.test(raw) || BigInt(raw) < 1n) {
    throw new Error(`${name} inválido: use um inteiro ≥ 1 (recebido "${raw}")`);
  }
  return BigInt(raw);
}

/** Número finito > 0 (minutos da janela de observação). */
function positiveNumber(name: string, fallback: string): number {
  const raw = (process.env[name] ?? fallback).trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} inválido: use um número > 0 (recebido "${raw}")`);
  }
  return n;
}

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
    confirmations: positiveInt("CONFIRMATIONS", "2"),
    observationWindowMs: positiveNumber("OBSERVATION_WINDOW_MIN", "10") * 60_000,
    // Tamanho da janela de eth_getLogs: RPCs gratuitos limitam a faixa (Alchemy free: 10 blocos).
    scanChunkBlocks: positiveInt("SCAN_CHUNK_BLOCKS", "10"),
  };
}

export type ServerConfig = ReturnType<typeof serverConfig>;
