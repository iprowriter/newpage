import type { PrismaClient } from "@prisma/client";

import { getDb } from "@/lib/db";
import {
  getEmbeddingBaseUrl,
  getEmbeddingModel,
  getModelId,
  getOllamaBaseUrl,
  getProvider,
  getQdrantUrl,
  type Provider as ProviderId,
} from "@/lib/env";
import type { GraphDeps } from "@/lib/rag/graph";
import { geminiProvider } from "@/lib/rag/providers/gemini";
import { ollamaProvider } from "@/lib/rag/providers/ollama";
import type { Provider } from "@/lib/rag/providers/types";
import type { ChunkLoader } from "@/lib/rag/retrieve";
import { createClient } from "@/lib/rag/vector";

/**
 * Wires the framework-free core (`src/lib/rag`) to this application's
 * environment and database.
 *
 * This module exists precisely so the core does not: it reads env vars and
 * touches Prisma, both of which the core deliberately avoids so that
 * `scripts/eval.ts` can construct the same graph with different settings and run
 * it headless (ADR-0007).
 */

export function resolveProvider(requested?: string): Provider {
  const id: ProviderId = requested === "gemini" || requested === "ollama" ? requested : getProvider();

  if (id === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey, " +
          "or switch to the local provider (LLM_PROVIDER=ollama).",
      );
    }
    return geminiProvider(key, getModelId("gemini"));
  }
  return ollamaProvider(getOllamaBaseUrl(), getModelId("ollama"));
}

/**
 * Hydrates chunk text from Postgres. Injected rather than imported by the core,
 * which is what keeps `retrieve()` testable without a database.
 */
export function chunkLoader(db: PrismaClient): ChunkLoader {
  return async (chunkIds) => {
    const rows = await db.chunk.findMany({
      where: { id: { in: chunkIds } },
      include: { document: { select: { filename: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      collectionId: row.collectionId,
      page: row.page,
      headingPath: row.headingPath,
      displayText: row.displayText,
      filename: row.document.filename,
    }));
  };
}

export function embeddingOptions() {
  return { baseUrl: getEmbeddingBaseUrl(), model: getEmbeddingModel() };
}

export function graphDeps(provider: Provider): GraphDeps {
  const db = getDb();
  return {
    provider,
    qdrant: createClient(getQdrantUrl()),
    embedding: embeddingOptions(),
    loadChunks: chunkLoader(db),
  };
}
