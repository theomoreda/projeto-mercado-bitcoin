import { appDeps } from "@/lib/deps";
import { handleActivateWallet } from "@/lib/wallet";

export function POST(req: Request) {
  return handleActivateWallet(req, appDeps());
}
