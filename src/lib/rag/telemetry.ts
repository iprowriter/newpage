import { SpanStatusCode, trace, type Attributes, type Span } from "@opentelemetry/api";

/**
 * OpenTelemetry spans for the retrieval pipeline (ADR-0016).
 *
 * **Why the core is allowed to depend on this.** `@opentelemetry/api` is a
 * façade: with no SDK registered every call is a no-op against a non-recording
 * span. So `scripts/eval.mts` runs the same instrumented code headless, at full
 * speed, emitting nothing — which is exactly the property the ESLint rule on this
 * directory protects, and the reason this is not a framework import in disguise.
 *
 * **Why bother, given traces already persist to Postgres.** They serve different
 * readers. The Postgres trace is *this* system's story, shaped for the `/traces`
 * page: retrieved chunks, grade decisions, refusal reasons. OTel is the standard
 * shape, and it is what makes the productionisation answer real — pointing at
 * Langfuse, Datadog or Honeycomb becomes an environment variable rather than an
 * instrumentation project. Building one and promising the other would have been
 * the weaker half of both.
 *
 * Attribute names follow the OTel GenAI semantic conventions where they exist
 * (`gen_ai.*`), so a vendor's LLM view lights up without a mapping layer.
 */

const tracer = trace.getTracer("newpage.rag");

export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      // Recorded on the span rather than only rethrown: a failed request that
      // shows as a gap in a trace is the hardest kind to diagnose later.
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/** GenAI semantic conventions, in one place so they stay spelled consistently. */
export const GEN_AI = {
  system: "gen_ai.system",
  operation: "gen_ai.operation.name",
  requestModel: "gen_ai.request.model",
  temperature: "gen_ai.request.temperature",
  inputTokens: "gen_ai.usage.input_tokens",
  outputTokens: "gen_ai.usage.output_tokens",
} as const;

/** This application's own vocabulary, namespaced so it cannot collide. */
export const RAG = {
  collectionId: "rag.collection.id",
  topK: "rag.retrieval.top_k",
  resultCount: "rag.retrieval.result_count",
  topScore: "rag.retrieval.top_score",
  embeddingModel: "rag.embedding.model",
  gradeDecision: "rag.grade.decision",
  rewriteFired: "rag.rewrite.fired",
  outcome: "rag.outcome",
  refusalReason: "rag.refusal.reason",
  documentId: "rag.document.id",
  chunkCount: "rag.chunk.count",
  pageCount: "rag.page.count",
} as const;
