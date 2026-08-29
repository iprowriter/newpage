/**
 * Embeddings, always local (ADR-0004).
 *
 * Not a configurable provider, deliberately. Two reasons:
 *
 * 1. **It sharpens the privacy claim.** Ingestion is where whole documents get
 *    sent somewhere. Keeping embeddings local means that even when generation
 *    runs on Gemini, only the retrieved chunks for one query ever leave the
 *    machine — never the corpus. That is a materially stronger claim than
 *    "supports local models", and the one a regulated client cares about.
 *
 * 2. **The choice is not actually runtime-switchable.** Swapping embedding
 *    models invalidates the entire index, because the dimension is fixed into the
 *    Qdrant collection at creation. Presenting it as a config toggle would imply
 *    a flexibility that does not exist; it is a schema decision wearing an
 *    environment variable.
 */

export interface EmbedOptions {
  baseUrl: string;
  model: string;
  /** Ollama holds the whole batch in memory, so this stays modest. */
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 32;

export async function embedAll(texts: string[], options: EmbedOptions): Promise<number[][]> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    vectors.push(...(await embedBatch(texts.slice(i, i + batchSize), options)));
  }
  return vectors;
}

export async function embedOne(text: string, options: EmbedOptions): Promise<number[]> {
  const [vector] = await embedBatch([text], options);
  return vector;
}

async function embedBatch(texts: string[], options: EmbedOptions): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await fetch(`${options.baseUrl}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: options.model, input: texts }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // The overwhelmingly common cause is a model that was never pulled, and the
    // raw upstream error does not say so. Saying it here saves the reviewer a
    // search on their first run.
    throw new Error(
      `Embedding request failed (${response.status}). Is Ollama running and has "${options.model}" been pulled? ` +
        `Try: ollama pull ${options.model}. ${detail.slice(0, 200)}`,
    );
  }

  const body = (await response.json()) as { embeddings?: number[][] };
  if (!body.embeddings || body.embeddings.length !== texts.length) {
    throw new Error(
      `Embedding response returned ${body.embeddings?.length ?? 0} vectors for ${texts.length} inputs.`,
    );
  }
  return body.embeddings;
}
