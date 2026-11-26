import { appDeps } from "@/lib/deps";
import { handleMe } from "@/lib/me";

export function GET(req: Request) {
  return handleMe(req, appDeps());
}
