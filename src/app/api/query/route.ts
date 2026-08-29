import { getDb } from "@/lib/db";
import { getEmbeddingModel } from "@/lib/env";
import { buildAnswerGraph } from "@/lib/rag/graph";
import { graphDeps, resolveProvider } from "@/lib/rag-runtime";

/**
 * Ask a question, scoped to one collection.
 *
 * `collectionId` arrives in the request body. Correct for a demo, wrong for
 * production: under ADR-0010 isolation is a payload filter, so a client that can
 * name a collection can read it. In production this value comes from the
 * authenticated session and is never accepted from the client (ADR-0020) — and
 * because retrieval has a single enforced entry point, that is a change in one
 * function rather than an audit of every call site.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    collectionId?: string;
    question?: string;
    provider?: string;
  };

  if (!body.collectionId || !body.question?.trim()) {
    return Response.json({ error: "collectionId and question are required." }, { status: 400 });
  }

  const db = getDb();
  const collection = await db.collection.findUnique({ where: { id: body.collectionId } });
  if (!collection) return Response.json({ error: "No such collection." }, { status: 404 });

  let provider;
  try {
    provider = resolveProvider(body.provider);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No provider." }, { status: 400 });
  }

  const question = body.question.trim();
  const started = Date.now();

  try {
    const graph = buildAnswerGraph(graphDeps(provider));
    const state = await graph.invoke({
      question,
      searchQuery: question,
      collectionId: collection.id,
      topK: collection.topK,
    });

    const latencyMs = Date.now() - started;

    // Every answer is stamped with the model that produced it and how long it
    // took, so switching to the local provider *demonstrates* the trade-off
    // rather than the README asserting it (ADR-0019).
    const retrieved = state.chunks.map((chunk, index) => ({
      n: index + 1,
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      filename: chunk.filename,
      page: chunk.page ?? null,
      headingPath: chunk.headingPath,
      score: chunk.score,
      displayText: chunk.displayText,
    }));

    const trace = await db.queryTrace.create({
      data: {
        collectionId: collection.id,
        question,
        answer: state.answer ?? null,
        outcome: state.outcome === "answered" ? "answered" : "refused",
        refusalReason: state.refusalReason ?? null,
        rewriteFired: state.rewrites > 0,
        rewrittenAs: state.rewrittenAs ?? null,
        gradeScore: state.gradeScore ?? null,
        // Chunk text is deliberately not duplicated into the trace: it already
        // lives in the chunk rows, and copying it would grow this table by the
        // size of the corpus for every question asked.
        retrieved: retrieved.map((source) => ({ ...source, displayText: undefined })),
        provider: provider.id,
        model: provider.model,
        embeddingModel: getEmbeddingModel(),
        latencyMs,
        retrievalMs: state.retrievalMs,
        generationMs: state.generationMs,
        promptTokens: state.promptTokens,
        outputTokens: state.outputTokens,
      },
    });

    return Response.json({
      traceId: trace.id,
      outcome: state.outcome,
      answer: state.answer ?? null,
      refusalReason: state.refusalReason ?? null,
      citations: state.citations,
      followUps: state.followUps,
      sources: retrieved,
      grade: {
        score: state.gradeScore ?? null,
        rewriteFired: state.rewrites > 0,
        rewrittenAs: state.rewrittenAs ?? null,
      },
      timing: { totalMs: latencyMs, retrievalMs: state.retrievalMs, generationMs: state.generationMs },
      model: { provider: provider.id, model: provider.model, embeddingModel: getEmbeddingModel() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The query failed.";
    await db.queryTrace.create({
      data: {
        collectionId: collection.id,
        question,
        outcome: "error",
        refusalReason: message,
        retrieved: [],
        provider: provider.id,
        model: provider.model,
        embeddingModel: getEmbeddingModel(),
        latencyMs: Date.now() - started,
      },
    });
    return Response.json({ error: message }, { status: 502 });
  }
}
