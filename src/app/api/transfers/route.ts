import { appDeps } from "@/lib/deps";
import { handleCreateTransfer } from "@/lib/transfers";

export function POST(req: Request) {
  return handleCreateTransfer(req, appDeps());
}
