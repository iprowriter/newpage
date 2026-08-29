/**
 * The provider seam (ADR-0003).
 *
 * Deliberately hand-rolled against each vendor's REST API rather than wrapped in
 * a LangChain chat model. ADR-0013 admits LangGraph for control flow and nothing
 * else, and the same reasoning applies here: these adapters are about sixty
 * lines each, they are the thing the README's local-vs-hosted comparison is
 * measuring, and a wrapper would put a layer of someone else's defaults between
 * me and the numbers I am publishing.
 *
 * It also makes the seam trivially mockable, which is what keeps the graph tests
 * fast and free.
 */

export interface GenerateRequest {
  system: string;
  user: string;
  /**
   * JSON Schema. When present the provider is asked for structured output, which
   * is how the answer and its follow-up questions come back in a single call
   * rather than two round-trips (ADR-0019).
   */
  schema?: Record<string, unknown>;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  promptTokens?: number;
  outputTokens?: number;
}

export interface Provider {
  readonly id: "gemini" | "ollama";
  /** The pinned model id, carried into every trace and eval row (ADR-0014). */
  readonly model: string;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
