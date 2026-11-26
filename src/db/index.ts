import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";

export function createDb(url: string) {
  return drizzle(url, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Qualquer coisa que execute queries: o banco ou uma transação aberta. */
export type Executor = Db | Tx;

let db: Db | undefined;

/** Instância única por processo, a partir de DATABASE_URL. */
export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida");
    db = createDb(url);
  }
  return db;
}
