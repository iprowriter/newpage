import { getDb } from "@/lib/db";

/**
 * The observability surface (ADR-0016).
 *
 * Traces live in Postgres and render inside the app, so a reviewer sees them on
 * their own queries with no account and no extra containers. Self-hosting
 * Langfuse would have meant taking compose from three services to roughly eight,
 * and the cold-start experience is the thing least worth gambling.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get("collectionId") ?? undefined;

  const db = getDb();
  const traces = await db.queryTrace.findMany({
    where: collectionId ? { collectionId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { collection: { select: { name: true } } },
  });

  return Response.json(
    traces.map((trace) => ({
      id: trace.id,
      collection: trace.collection.name,
      question: trace.question,
      answer: trace.answer,
      outcome: trace.outcome,
      refusalReason: trace.refusalReason,
      gradeScore: trace.gradeScore,
      rewriteFired: trace.rewriteFired,
      rewrittenAs: trace.rewrittenAs,
      retrieved: trace.retrieved,
      citations: trace.citations,
      provider: trace.provider,
      model: trace.model,
      embeddingModel: trace.embeddingModel,
      feedback: trace.feedback,
      feedbackNote: trace.feedbackNote,
      feedbackAt: trace.feedbackAt,
      latencyMs: trace.latencyMs,
      retrievalMs: trace.retrievalMs,
      generationMs: trace.generationMs,
      promptTokens: trace.promptTokens,
      outputTokens: trace.outputTokens,
      createdAt: trace.createdAt,
    })),
  );
}
