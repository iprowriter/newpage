import { getDb } from "@/lib/db";
import { getQdrantUrl } from "@/lib/env";
import { createClient, deleteByDocument } from "@/lib/rag/vector";

/**
 * Delete across two stores (specs.md §10).
 *
 * **Qdrant first, then Postgres.** There is no transaction spanning them, so the
 * ordering decides which half-failure you get:
 *
 * - Qdrant first: a failure leaves orphaned Postgres rows. Retrieval starts at
 *   Qdrant, so they are unreachable — inert, and cleanable.
 * - Postgres first: a failure leaves live vectors whose text is gone. Those stay
 *   retrievable and surface as a citation to a document that no longer exists.
 *
 * Both orders can fail. Only one fails toward the harmless state.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const db = getDb();

  const document = await db.document.findUnique({ where: { id } });
  if (!document) return Response.json({ error: "No such document." }, { status: 404 });

  try {
    await deleteByDocument(createClient(getQdrantUrl()), id);
  } catch (error) {
    await db.document.update({ where: { id }, data: { status: "delete_failed" } });
    return Response.json(
      {
        error: `Could not remove vectors: ${error instanceof Error ? error.message : error}. ` +
          `The document is marked delete_failed and remains searchable; retry to complete.`,
      },
      { status: 502 },
    );
  }

  // Chunks cascade from the document row.
  await db.document.delete({ where: { id } });
  return Response.json({ deleted: id });
}
