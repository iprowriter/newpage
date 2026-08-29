/**
 * Environment access, in one place.
 *
 * Kept out of src/lib/rag deliberately: the retrieval core takes its config as
 * plain arguments so scripts/eval.ts can run the same code with different
 * settings (350 vs 800 token chunks, hosted vs local) without mutating
 * process.env between runs. This module is where the *application* resolves
 * defaults; the core never reads them itself.
 */

export type Provider = "gemini" | "ollama";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. See .env.example.`);
  }
  return value;
}

export function getDatabaseUrl(): string {
  return required("DATABASE_URL");
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getQdrantUrl(): string {
  return process.env.QDRANT_URL ?? "http://localhost:6333";
}

/**
 * Ollama for *generation*. Defaults to the host, not a container.
 *
 * Docker Desktop gives containers no GPU on macOS, so a generation model running
 * inside one is CPU-bound and slow enough to define a reviewer's impression of
 * the whole submission (ADR-0003).
 */
export function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
}

/**
 * Ollama for *embeddings*. Defaults to the generation endpoint, but is separately
 * configurable — and in Compose it points at a container.
 *
 * The two split because the constraint that keeps generation on the host does
 * not apply here. Embedding models are small and CPU-fast (ADR-0004), so a
 * container serves them at full speed. That matters more than it sounds:
 * embeddings are required to ingest *anything*, so without a guaranteed endpoint
 * `docker compose up` produces an application that cannot accept a document.
 * Generation degrades to a config change; embeddings degrade to a dead demo.
 */
export function getEmbeddingBaseUrl(): string {
  return process.env.EMBEDDING_BASE_URL ?? getOllamaBaseUrl();
}

/** Which generation provider the app defaults to. Gemini (ADR-0009). */
export function getProvider(): Provider {
  const value = process.env.LLM_PROVIDER ?? "gemini";
  if (value !== "gemini" && value !== "ollama") {
    throw new Error(`LLM_PROVIDER must be "gemini" or "ollama", got "${value}".`);
  }
  return value;
}

/**
 * Pinned model ids — never a floating alias (ADR-0014). An eval number produced
 * against a rotating alias is not reproducible, and the README's comparison
 * table is the strongest thing in the submission.
 *
 * The pin lives here rather than only in an env file, so a checkout without one
 * still runs the exact model the published numbers came from. An env var
 * overrides it for deliberate comparisons.
 */
const PINNED = {
  gemini: "gemini-3.6-flash",
  ollama: "llama3.2:3b",
} as const;

export function getModelId(provider: Provider): string {
  const override = provider === "gemini" ? process.env.GEMINI_MODEL : process.env.OLLAMA_MODEL;
  return override || PINNED[provider];
}

/**
 * Embeddings always run locally (ADR-0004), so only the retrieved chunks for a
 * single query ever leave the machine — never the corpus.
 *
 * Effectively a schema decision rather than a config value: the dimension is
 * fixed into the Qdrant collection at creation, so changing this means dropping
 * and reindexing.
 */
export function getEmbeddingModel(): string {
  return process.env.EMBEDDING_MODEL ?? "nomic-embed-text";
}
