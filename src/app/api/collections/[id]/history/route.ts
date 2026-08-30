import { getDb } from "@/lib/db";

/**
 * Past questions and answers for one collection, oldest first.
 *
 * The thread is rebuilt from `query_traces` rather than from a second messages
 * table. Every field the Ask view needs is already written there on each query —
 * question, answer, refusal reason, retrieved chunk ids with scores, model,
 * timings — and there is already an index on `(collectionId, createdAt)` for
 * exactly this read. A separate table would mean writing the same row twice and
 * finding out later that the two had drifted.
 *
 * The cost of that choice is real and belongs in production planning rather than
 * in a comment: a trace *retention* policy would silently delete a reader's
 * history. ADR-0025 records it, and the fix in production is to keep the
 * conversation rows and expire only the diagnostic columns.
 */

/** Enough to feel continuous without turning a revisit into a large query. */
const LIMIT = 20;

interface StoredSource {
  n: number;
  chunkId: string;
  documentId: string;
  filename: string;
  page: number | null;
  headingPath: string[];
  score: number;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/collections/[id]/history">) {
  const { id } = await ctx.params;
  const db = getDb();

  const traces = await db.queryTrace.findMany({
    // `error` traces are deliberately excluded. Their stored reason is the
    // upstream diagnostic, not the sentence the reader was shown, so replaying
    // one would put internal text on screen. A failed request is also not part
    // of the conversation: nothing was answered, and it is still in /traces.
    where: { collectionId: id, outcome: { in: ["answered", "refused"] } },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
  });

  // The trace stores chunk ids and scores but not the chunk text, on purpose:
  // duplicating it would grow this table by the size of the corpus for every
  // question asked. Reading it back means one join, done once for the whole
  // page rather than per answer.
  const chunkIds = traces.flatMap((trace) =>
    (trace.retrieved as unknown as StoredSource[]).map((source) => source.chunkId),
  );
  const chunks = await db.chunk.findMany({
    where: { id: { in: chunkIds } },
    select: { id: true, displayText: true },
  });
  const textById = new Map(chunks.map((chunk) => [chunk.id, chunk.displayText]));

  const history = traces.reverse().map((trace) => ({
    question: trace.question,
    payload: {
      traceId: trace.id,
      outcome: trace.outcome,
      answer: trace.answer,
      refusalReason: trace.refusalReason,
      citations: trace.citations,
      followUps: [],
      sources: (trace.retrieved as unknown as StoredSource[]).map((source) => ({
        ...source,
        // A document deleted since the answer was written leaves a citation that
        // cannot resolve. Saying so is the honest option; dropping the source
        // would quietly rewrite history so the answer looked better sourced than
        // it now is.
        displayText: textById.get(source.chunkId) ?? "",
        available: textById.has(source.chunkId),
      })),
      grade: {
        score: trace.gradeScore,
        rewriteFired: trace.rewriteFired,
        rewrittenAs: trace.rewrittenAs,
      },
      timing: {
        totalMs: trace.latencyMs,
        retrievalMs: trace.retrievalMs ?? 0,
        generationMs: trace.generationMs ?? 0,
      },
      model: {
        provider: trace.provider,
        model: trace.model,
        embeddingModel: trace.embeddingModel,
      },
      feedback: trace.feedback,
      askedAt: trace.createdAt,
    },
  }));

  return Response.json({ history, truncated: traces.length === LIMIT });
}
