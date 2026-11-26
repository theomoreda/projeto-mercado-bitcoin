import { appDeps } from "@/lib/deps";
import { handleGetTransfer } from "@/lib/transfers";

export async function GET(req: Request, ctx: RouteContext<"/api/transfers/[id]">) {
  const { id } = await ctx.params;
  return handleGetTransfer(req, appDeps(), id);
}
