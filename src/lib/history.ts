import type { PrismaClient } from "@prisma/client";

/**
 * Rebuilds a collection's conversation from the trace table (ADR-0025).
 *
 * Lifted out of the route handler for the same reason `deleteDocument` was: the
 * substance here is the join and the ordering, and both fail quietly. A broken
 * rejoin does not throw, it just returns answers whose sources have no text, and
 * nothing on the page says so.
 *
 * There is no second `messages` table. Every field this needs is already written
 * to `query_traces` on each query, and there is an index on
 * `(collectionId, createdAt)` for exactly this read. Two tables would mean two
 * writes that must agree forever, and no way to tell which one lied when they
 * stopped agreeing.
 */

/** Enough to feel continuous without turning a revisit into a large query. */
export const HISTORY_LIMIT = 20;

/** The shape stored in `query_traces.retrieved`: chunk ids and scores, no text. */
interface StoredSource {
  n: number;
  chunkId: string;
  documentId: string;
  filename: string;
  page: number | null;
  headingPath: string[];
  score: number;
}

export interface HistorySource extends StoredSource {
  displayText: string;
  /** False when the chunk is gone because its document was deleted. */
  available: boolean;
}

export interface HistoryExchange {
  question: string;
  payload: {
    traceId: string;
    outcome: string;
    answer: string | null;
    refusalReason: string | null;
    citations: number[];
    followUps: string[];
    sources: HistorySource[];
    grade: { score: number | null; rewriteFired: boolean; rewrittenAs: string | null };
    timing: { totalMs: number; retrievalMs: number; generationMs: number };
    model: { provider: string; model: string; embeddingModel: string };
    feedback: "up" | "down" | null;
    askedAt: Date;
  };
}

export async function loadHistory(
  collectionId: string,
  deps: { db: PrismaClient },
): Promise<{ history: HistoryExchange[]; truncated: boolean }> {
  const traces = await deps.db.queryTrace.findMany({
    // `error` traces are deliberately excluded. Their stored reason is the
    // upstream diagnostic, not the sentence the reader was shown, so replaying
    // one would put internal text on screen. A failed request is also not part
    // of the conversation: nothing was answered. They remain in /traces.
    where: { collectionId, outcome: { in: ["answered", "refused"] } },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  // The trace stores chunk ids and scores but not the chunk text, on purpose:
  // duplicating it would grow that table by the size of the corpus for every
  // question asked. Reading it back is one query for the whole page rather than
  // one per answer.
  const chunkIds = traces.flatMap((trace) =>
    (trace.retrieved as unknown as StoredSource[]).map((source) => source.chunkId),
  );
  const chunks = await deps.db.chunk.findMany({
    where: { id: { in: chunkIds } },
    select: { id: true, displayText: true },
  });
  const textById = new Map(chunks.map((chunk) => [chunk.id, chunk.displayText]));

  // Newest first out of the database because that is what the index and the
  // limit want; oldest first on the way out because that is a conversation.
  const history = traces.reverse().map((trace) => ({
    question: trace.question,
    payload: {
      traceId: trace.id,
      outcome: trace.outcome,
      answer: trace.answer,
      refusalReason: trace.refusalReason,
      citations: trace.citations,
      // Not stored, and not worth a column: they were only ever buttons for the
      // turn they belonged to, and re-showing stale ones invites a question the
      // reader has already moved past.
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

  return { history, truncated: traces.length === HISTORY_LIMIT };
}
