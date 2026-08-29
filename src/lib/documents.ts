import type { PrismaClient } from "@prisma/client";
import type { QdrantClient } from "@qdrant/js-client-rest";

import { deleteByDocument } from "@/lib/rag/vector";

/**
 * Removes a document from both stores (specs.md §10).
 *
 * Lifted out of the route handler so the ordering can be tested. The ordering is
 * the whole substance of this function, and it was previously provable only by
 * reading it.
 *
 * **Qdrant first, then Postgres.** There is no transaction spanning them, so the
 * order decides which half-failure you get:
 *
 * - Qdrant first: a failure leaves Postgres rows nothing can reach, because
 *   retrieval always begins at Qdrant. Inert, and cleanable.
 * - Postgres first: a failure leaves live vectors whose text is gone. Those stay
 *   retrievable and surface as a citation to a document that no longer exists.
 *
 * Both orders can fail. Only one fails toward the harmless state.
 */

export interface DeleteDeps {
  db: PrismaClient;
  qdrant: QdrantClient;
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "vectors_failed"; message: string };

export async function deleteDocument(documentId: string, deps: DeleteDeps): Promise<DeleteResult> {
  const document = await deps.db.document.findUnique({ where: { id: documentId } });
  if (!document) return { ok: false, reason: "not_found" };

  try {
    await deleteByDocument(deps.qdrant, documentId);
  } catch (error) {
    // Marked rather than silently left behind: an operator needs to see that
    // this document is in a half-state, and retrying must be possible.
    await deps.db.document.update({
      where: { id: documentId },
      data: { status: "delete_failed" },
    });
    return {
      ok: false,
      reason: "vectors_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  // Chunks cascade from the document row.
  await deps.db.document.delete({ where: { id: documentId } });
  return { ok: true };
}
