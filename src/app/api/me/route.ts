import { getDb } from "@/db";
import { privyVerifier } from "@/lib/auth";
import { serverConfig } from "@/lib/config";
import { handleMe } from "@/lib/me";

export function GET(req: Request) {
  return handleMe(req, { db: getDb(), verify: privyVerifier, config: serverConfig() });
}
