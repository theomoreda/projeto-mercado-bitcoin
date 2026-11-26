import { existsSync } from "node:fs";

/** Carrega .env.local para scripts de linha de comando (o Next já faz isso sozinho). */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
