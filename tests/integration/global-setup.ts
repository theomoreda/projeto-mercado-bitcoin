import { execSync } from "node:child_process";
import { Client } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../../src/db/index.ts";

/** Compila o contrato e cria/migra o banco de teste antes da suíte de integração. */
export default async function setup() {
  execSync("forge build --quiet", { cwd: "contracts", stdio: "inherit" });

  const url = new URL(process.env.DATABASE_URL!);
  const name = url.pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const db = createDb(url.toString());
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  await db.$client.end();
}
