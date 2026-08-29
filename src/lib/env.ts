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

export function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
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
 */
export function getModelId(provider: Provider): string {
  return provider === "gemini"
    ? required("GEMINI_MODEL")
    : required("OLLAMA_MODEL");
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
