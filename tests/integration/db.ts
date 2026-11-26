import { sql } from "drizzle-orm";
import { createDb } from "../../src/db";

export const db = createDb(process.env.DATABASE_URL!);

export async function resetDb() {
  await db.execute(sql`TRUNCATE transfers, accounts`);
}
