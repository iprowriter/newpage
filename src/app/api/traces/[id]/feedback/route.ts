import { getDb } from "@/lib/db";

/**
 * Records a reader's judgement on an answer.
 *
 * This is observability, not a satisfaction meter. Retrieval scores and
 * groundedness checks establish whether an answer was *supported*; only a reader
 * knows whether it was *useful*, and the space between those two is exactly
 * where prompt drift lives — an answer that cites correctly and still misses the
 * question passes every automated check in the system.
 *
 * Each rating lands on the trace beside the retrieved chunks, scores, model and
 * prompt that produced it, so a thumbs-down is a complete reproducible case
 * rather than a complaint. That set is the honest seed of an eval suite: real
 * questions people asked, rather than ones I invented and therefore already knew
 * the system could handle (ADR-0015).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/traces/[id]/feedback">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as { rating?: string; note?: string };

  if (body.rating !== "up" && body.rating !== "down") {
    return Response.json({ error: 'rating must be "up" or "down".' }, { status: 400 });
  }

  const db = getDb();
  const trace = await db.queryTrace.findUnique({ where: { id } });
  if (!trace) return Response.json({ error: "No such trace." }, { status: 404 });

  // Rating the same answer again replaces the previous verdict rather than
  // appending: a reader changing their mind is a correction, not a second
  // opinion, and counting both would quietly skew the dataset.
  const updated = await db.queryTrace.update({
    where: { id },
    data: {
      feedback: body.rating,
      feedbackNote: body.note?.trim() || null,
      feedbackAt: new Date(),
    },
  });

  return Response.json({ id: updated.id, feedback: updated.feedback });
}
