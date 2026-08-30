import { getDb } from "@/lib/db";
import { loadHistory } from "@/lib/history";

/**
 * Past questions and answers for one collection, oldest first (ADR-0025).
 *
 * The work is in `src/lib/history.ts` so it can be tested without a server or a
 * database. This handler is the Next-specific half and nothing else.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/collections/[id]/history">) {
  const { id } = await ctx.params;
  return Response.json(await loadHistory(id, { db: getDb() }));
}
