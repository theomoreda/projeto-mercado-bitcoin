import { afterEach, describe, expect, it } from "vitest";
import { serverConfig } from "./config.ts";

const KEYS = ["CONFIRMATIONS", "SCAN_CHUNK_BLOCKS", "OBSERVATION_WINDOW_MIN"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("serverConfig: validação de env", () => {
  it("usa os padrões quando nada está definido", () => {
    for (const k of KEYS) delete process.env[k];
    const c = serverConfig();
    expect(c.confirmations).toBe(2n);
    expect(c.scanChunkBlocks).toBe(10n);
    expect(c.observationWindowMs).toBe(600_000);
  });

  it("aceita valores válidos", () => {
    process.env.CONFIRMATIONS = "5";
    process.env.SCAN_CHUNK_BLOCKS = "500";
    process.env.OBSERVATION_WINDOW_MIN = "0.5";
    const c = serverConfig();
    expect(c.confirmations).toBe(5n);
    expect(c.scanChunkBlocks).toBe(500n);
    expect(c.observationWindowMs).toBe(30_000);
  });

  it.each(["0", "-1", "abc", "1.5", "", " ", "2 blocos"])("CONFIRMATIONS=%j é recusado", (v) => {
    process.env.CONFIRMATIONS = v;
    expect(() => serverConfig()).toThrow(/CONFIRMATIONS inválido/);
  });

  it.each(["0", "-10", "dez", "0x10", ""])("SCAN_CHUNK_BLOCKS=%j é recusado", (v) => {
    process.env.SCAN_CHUNK_BLOCKS = v;
    expect(() => serverConfig()).toThrow(/SCAN_CHUNK_BLOCKS inválido/);
  });

  it.each(["0", "-1", "abc", "Infinity", ""])("OBSERVATION_WINDOW_MIN=%j é recusado", (v) => {
    process.env.OBSERVATION_WINDOW_MIN = v;
    expect(() => serverConfig()).toThrow(/OBSERVATION_WINDOW_MIN inválido/);
  });
});
