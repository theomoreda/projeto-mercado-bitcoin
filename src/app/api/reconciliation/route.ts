import { requireAccount } from "@/lib/account";
import { appDeps } from "@/lib/deps";
import { respond } from "@/lib/http";
import { reconcile } from "@/lib/reconcile";

/** GET /api/reconciliation — invariante só da própria conta. */
export function GET(req: Request) {
  const deps = appDeps();
  return respond(async () => {
    const { account } = await requireAccount(req, deps);
    const { ok, accounts } = await reconcile(deps, account.id);
    return { ok, account: accounts[0] };
  });
}
