import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Valores monetários sempre como bigint (RNF-03). Regras de saldo vivem no banco (SPEC.md › Modelo de dados).

export const accounts = pgTable(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    privyUserId: text().notNull().unique(),
    email: text().notNull(),
    walletAddress: text().unique(),
    availableCents: bigint({ mode: "bigint" }).notNull(),
    reservedCents: bigint({ mode: "bigint" })
      .notNull()
      .default(sql`0`),
    excessMicro: bigint({ mode: "bigint" })
      .notNull()
      .default(sql`0`),
    initialMicro: bigint({ mode: "bigint" }).notNull(),
    lastScannedBlock: bigint({ mode: "bigint" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("available_non_negative", sql`${t.availableCents} >= 0`),
    check("reserved_non_negative", sql`${t.reservedCents} >= 0`),
    check("excess_below_one_cent", sql`${t.excessMicro} >= 0 AND ${t.excessMicro} < 10000`),
  ],
);

export const DIRECTIONS = ["MB_TO_WALLET", "WALLET_TO_MB"] as const;
export const STATUSES = ["PROCESSANDO", "CONFIRMADA", "FALHOU"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type Status = (typeof STATUSES)[number];

export const transfers = pgTable(
  "transfers",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    direction: text({ enum: DIRECTIONS }).notNull(),
    amountMicro: bigint({ mode: "bigint" }).notNull(),
    status: text({ enum: STATUSES }).notNull().default("PROCESSANDO"),
    // RNF-02: cada hash afeta o ledger no máximo uma vez.
    txHash: text().unique(),
    clientRequestId: text().unique(),
    nonce: bigint({ mode: "bigint" }),
    rawTx: text(),
    failureReason: text(),
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("amount_non_negative", sql`${t.amountMicro} >= 0`),
    check("direction_valid", sql`${t.direction} IN ('MB_TO_WALLET', 'WALLET_TO_MB')`),
    check("status_valid", sql`${t.status} IN ('PROCESSANDO', 'CONFIRMADA', 'FALHOU')`),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
