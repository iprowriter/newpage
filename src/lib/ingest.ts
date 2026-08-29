import type { PrismaClient } from "@prisma/client";
import type { QdrantClient } from "@qdrant/js-client-rest";

import { chunkDocument } from "@/lib/rag/chunk";
import { embedAll, type EmbedOptions } from "@/lib/rag/embed";
import { extract } from "@/lib/rag/extract";
import type { Provider } from "@/lib/rag/providers/types";
import { generateStarterQuestions } from "@/lib/rag/starter-questions";
import { ensureCollection, upsertChunks } from "@/lib/rag/vector";

/**
 * Ingestion: upload → extract → chunk → embed → write (specs.md §5).
 *
 * Lives outside `src/lib/rag` because it coordinates the two stores, and the
 * core stays free of Prisma so the eval harness can drive it directly.
 *
 * **Write order is Postgres first, then Qdrant**, which is the mirror image of
 * the delete order (specs.md §10) and for the same reason. Retrieval always
 * begins at Qdrant, so a vector that exists without its row is a chunk that can
 * be retrieved and cannot be rendered — a citation to nothing. A row without its
 * vector is merely invisible. Both halves of the lifecycle fail toward the
 * inert state rather than the incoherent one.
 */

export interface IngestDeps {
  db: PrismaClient;
  qdrant: QdrantClient;
  embedding: EmbedOptions;
  /** Optional: without it the document ingests fine, just with no suggestions. */
  provider?: Provider;
}

export interface IngestRequest {
  collectionId: string;
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  pageCount?: number;
}

export async function ingestDocument(
  request: IngestRequest,
  deps: IngestDeps,
): Promise<IngestResult> {
  const collection = await deps.db.collection.findUniqueOrThrow({
    where: { id: request.collectionId },
  });

  const document = await deps.db.document.create({
    data: {
      collectionId: collection.id,
      filename: request.filename,
      mimeType: request.mimeType,
      byteSize: request.data.byteLength,
      status: "processing",
    },
  });

  try {
    const extracted = await extract(request.data, request.mimeType);

    const chunks = chunkDocument(extracted, {
      // Per-collection, because a validation protocol and a Q&A document do not
      // want the same granularity (ADR-0002).
      chunkTokens: collection.chunkTokens,
      overlapSentences: 1,
      docTitle: stripExtension(request.filename),
    });

    if (chunks.length === 0) {
      throw new Error("Extraction produced no chunks. The file may be empty or unreadable.");
    }

    const vectors = await embedAll(chunks.map((c) => c.embedText), deps.embedding);
    await ensureCollection(deps.qdrant, vectors[0].length);

    const rows = await deps.db.$transaction(
      chunks.map((chunk) =>
        deps.db.chunk.create({
          data: {
            documentId: document.id,
            collectionId: collection.id,
            chunkIndex: chunk.chunkIndex,
            page: chunk.page,
            headingPath: chunk.headingPath,
            displayText: chunk.displayText,
            charStart: chunk.charStart,
            charEnd: chunk.charEnd,
            tokenCount: chunk.tokenCount,
          },
        }),
      ),
    );

    await upsertChunks(
      deps.qdrant,
      rows.map((row, i) => ({
        chunkId: row.id,
        documentId: document.id,
        collectionId: collection.id,
        vector: vectors[i],
      })),
    );

    // Suggestions are a convenience, not part of the document being usable, so a
    // failure here must not fail the ingest — it degrades to no suggestions
    // (ADR-0019). Deliberately after the chunks are committed: if this throws,
    // the document is already queryable.
    let starterQuestions: string[] = [];
    if (deps.provider) {
      try {
        starterQuestions = await generateStarterQuestions(
          stripExtension(request.filename),
          chunks,
          deps.provider,
        );
      } catch {
        starterQuestions = [];
      }
    }

    await deps.db.document.update({
      where: { id: document.id },
      data: { status: "ready", pageCount: extracted.pageCount ?? null, starterQuestions },
    });

    return { documentId: document.id, chunkCount: rows.length, pageCount: extracted.pageCount };
  } catch (error) {
    // The failure is recorded on the document rather than thrown away, so the
    // document list can show *why* (ADR-0019). A scanned PDF that silently
    // ingests as empty looks like a retrieval bug for the rest of its life.
    await deps.db.document.update({
      where: { id: document.id },
      data: { status: "failed", error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}
