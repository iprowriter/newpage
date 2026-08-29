import { QdrantClient } from "@qdrant/js-client-rest";

import type { RetrievedChunk } from "./types";

/**
 * Qdrant access (ADR-0010).
 *
 * **One Qdrant collection for the entire corpus**, with the department carried
 * as a `collectionId` payload field and applied as a filter on every query.
 *
 * The rejected alternative was a Qdrant collection per department, which looks
 * tidier and is worse: many small indexes, degraded recall on the sparse ones,
 * and any cross-department operation becomes N queries. Single collection plus a
 * payload filter is the pattern Qdrant recommends for multi-tenancy, it stays
 * one query, and Qdrant applies the filter *during* HNSW traversal rather than
 * over-fetching and discarding afterwards.
 *
 * The cost of that choice is that isolation is now enforced by code rather than
 * by physical separation — a missing filter leaks silently instead of erroring.
 * That is why nothing outside `retrieve.ts` is allowed to call `search`.
 */

export const COLLECTION = "chunks";

export interface ChunkPoint {
  chunkId: string;
  documentId: string;
  collectionId: string;
  vector: number[];
}

export function createClient(url: string): QdrantClient {
  return new QdrantClient({ url });
}

/**
 * Idempotent. The vector size comes from the embedding model rather than a
 * constant, because those two disagreeing is a silent corruption: Qdrant would
 * reject the writes, but only after ingestion had already updated Postgres.
 */
export async function ensureCollection(client: QdrantClient, vectorSize: number): Promise<void> {
  if (await client.collectionExists(COLLECTION).then((r) => r.exists)) return;

  await client.createCollection(COLLECTION, {
    vectors: { size: vectorSize, distance: "Cosine" },
  });

  // Without a payload index, filtering degrades to a scan as the corpus grows.
  // Isolation is on the hot path of every single query, so this is not optional.
  await client.createPayloadIndex(COLLECTION, {
    field_name: "collectionId",
    field_schema: "keyword",
  });
  await client.createPayloadIndex(COLLECTION, {
    field_name: "documentId",
    field_schema: "keyword",
  });
}

export async function upsertChunks(client: QdrantClient, points: ChunkPoint[]): Promise<void> {
  if (points.length === 0) return;

  try {
    await client.upsert(COLLECTION, {
      wait: true,
      points: points.map((p) => ({
        id: p.chunkId,
        vector: p.vector,
        payload: { documentId: p.documentId, collectionId: p.collectionId },
      })),
    });
  } catch (error) {
    throw new Error(`Qdrant upsert failed: ${describeQdrantError(error)}`);
  }
}

/**
 * The client throws with a bare "Bad Request" and hides the useful part in
 * `.data.status.error`. Unwrapped here because the difference between "Bad
 * Request" and "value clx... is not a valid point ID, valid values are either an
 * unsigned integer or a UUID" is the difference between a debugging session and
 * reading the answer.
 */
function describeQdrantError(error: unknown): string {
  const detail = (error as { data?: { status?: { error?: string } } })?.data?.status?.error;
  if (detail) return detail;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Removes every chunk of a document in one call. The delete-by-filter that made
 * Qdrant the better choice for the two-store deletion problem (specs.md §10).
 */
export async function deleteByDocument(client: QdrantClient, documentId: string): Promise<void> {
  await client.delete(COLLECTION, {
    wait: true,
    filter: { must: [{ key: "documentId", match: { value: documentId } }] },
  });
}

/**
 * Re-points every chunk of the given documents at a different collection.
 *
 * This is the only operation that moves the isolation boundary of data that
 * already exists, so it is worth being explicit about the failure mode. Retrieval
 * filters on the Qdrant payload, hydrates from Postgres, and then asserts the two
 * agree (`retrieve.ts`). If a move half-completes, those two disagree and the
 * assertion throws — loudly, for the affected chunks only.
 *
 * That is the good outcome. A half-moved chunk is *detectably* broken rather than
 * quietly readable from a collection it no longer belongs to, which is what a
 * silent partial move would mean.
 *
 * Qdrant is updated first because it is a single filtered call and the more
 * likely of the two to fail; Postgres then follows in a transaction.
 */
export async function reassignCollection(
  client: QdrantClient,
  documentIds: string[],
  collectionId: string,
): Promise<void> {
  if (documentIds.length === 0) return;

  await client.setPayload(COLLECTION, {
    wait: true,
    payload: { collectionId },
    filter: { must: [{ key: "documentId", match: { any: documentIds } }] },
  });
}

/** Removes every chunk of a collection. Same ordering rationale as deleteByDocument. */
export async function deleteByCollection(client: QdrantClient, collectionId: string): Promise<void> {
  await client.delete(COLLECTION, {
    wait: true,
    filter: { must: [{ key: "collectionId", match: { value: collectionId } }] },
  });
}

export interface ScoredChunkId {
  chunkId: string;
  score: number;
}

/**
 * Internal. Callers go through `retrieve.ts`, which is the only place allowed to
 * decide what `collectionId` is — see the invariant in specs.md §7.3.
 */
export async function search(
  client: QdrantClient,
  vector: number[],
  collectionId: string,
  limit: number,
): Promise<ScoredChunkId[]> {
  // The universal query API; `search` was removed from the client. Qdrant applies
  // the filter during HNSW traversal rather than over-fetching and discarding,
  // which is the property that made collection scoping cheap enough to put on
  // every request (ADR-0010).
  const { points } = await client.query(COLLECTION, {
    query: vector,
    limit,
    filter: { must: [{ key: "collectionId", match: { value: collectionId } }] },
    with_payload: false,
  });

  return points.map((point) => ({ chunkId: String(point.id), score: point.score }));
}

export type { RetrievedChunk };
