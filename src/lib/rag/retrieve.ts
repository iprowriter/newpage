import type { QdrantClient } from "@qdrant/js-client-rest";

import { embedOne, type EmbedOptions } from "./embed";
import { RAG, withSpan } from "./telemetry";
import type { RetrievedChunk } from "./types";
import { search } from "./vector";

/**
 * The single retrieval entry point (specs.md §7.3).
 *
 * **Nothing else in the application is permitted to call `search` directly.**
 *
 * Why this exists as a rule rather than a convention: ADR-0010 chose one Qdrant
 * collection with a `collectionId` payload filter over a collection per
 * department. That moved the isolation boundary out of the database and into
 * this code. Under physical separation, asking Clinical Operations a question and
 * getting a Manufacturing Quality chunk back is an impossible query. Under a
 * payload filter, it is a forgotten line — and it fails silently, returning a
 * confident, well-cited answer sourced from a department the caller should not
 * be able to read.
 *
 * So `collectionId` is a required argument, the filter is built here, and no
 * caller is offered the opportunity to assemble one.
 *
 * In production this argument would be derived from the authenticated session
 * rather than from a request body (ADR-0020). That change lands in exactly one
 * place, which is the point.
 */

/** Hydration is injected so the core stays free of Prisma and of any framework. */
export type ChunkLoader = (chunkIds: string[]) => Promise<LoadedChunk[]>;

export interface LoadedChunk {
  id: string;
  documentId: string;
  collectionId: string;
  page: number | null;
  headingPath: string[];
  displayText: string;
  filename: string;
}

export interface RetrieveDeps {
  qdrant: QdrantClient;
  embedding: EmbedOptions;
  loadChunks: ChunkLoader;
}

export interface RetrieveRequest {
  /** Required. The isolation boundary. Never optional, never defaulted. */
  collectionId: string;
  question: string;
  topK: number;
}

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  embeddingMs: number;
  searchMs: number;
}

export async function retrieve(
  request: RetrieveRequest,
  deps: RetrieveDeps,
): Promise<RetrieveResult> {
  if (!request.collectionId) {
    throw new Error("retrieve() requires a collectionId. Retrieval is never unscoped.");
  }

  const embedStart = Date.now();
  const vector = await withSpan(
    "rag.embed_query",
    { [RAG.embeddingModel]: deps.embedding.model },
    () => embedOne(request.question, deps.embedding),
  );
  const embeddingMs = Date.now() - embedStart;

  const searchStart = Date.now();
  const hits = await withSpan(
    "rag.search",
    // The collection id is on the span deliberately: it is the isolation
    // boundary, and a trace that does not record which scope a search ran in
    // cannot answer the only question that matters after a suspected leak.
    { [RAG.collectionId]: request.collectionId, [RAG.topK]: request.topK },
    async (span) => {
      const results = await search(deps.qdrant, vector, request.collectionId, request.topK);
      span.setAttribute(RAG.resultCount, results.length);
      if (results[0]) span.setAttribute(RAG.topScore, results[0].score);
      return results;
    },
  );
  const searchMs = Date.now() - searchStart;

  if (hits.length === 0) return { chunks: [], embeddingMs, searchMs };

  const loaded = await deps.loadChunks(hits.map((h) => h.chunkId));
  const byId = new Map(loaded.map((chunk) => [chunk.id, chunk]));

  const chunks: RetrievedChunk[] = [];
  for (const hit of hits) {
    const chunk = byId.get(hit.chunkId);
    // A chunk in Qdrant with no row in Postgres means the two stores have drifted
    // — most likely a delete that half-completed (specs.md §10). Skipping keeps a
    // stale vector from surfacing as a citation to a document that no longer
    // exists; the orphan is cleaned up by reconciliation, not by this request.
    if (!chunk) continue;

    // Belt and braces. The Qdrant filter should already guarantee this, and if it
    // ever does not, the correct outcome is a loud failure rather than a leaked
    // answer. A cross-collection chunk reaching this point is a bug that must
    // never degrade quietly.
    if (chunk.collectionId !== request.collectionId) {
      throw new Error(
        `Isolation violation: chunk ${chunk.id} belongs to collection ${chunk.collectionId}, ` +
          `but was retrieved for ${request.collectionId}.`,
      );
    }

    chunks.push({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      collectionId: chunk.collectionId,
      score: hit.score,
      page: chunk.page ?? undefined,
      headingPath: chunk.headingPath,
      displayText: chunk.displayText,
      filename: chunk.filename,
    });
  }

  return { chunks, embeddingMs, searchMs };
}
