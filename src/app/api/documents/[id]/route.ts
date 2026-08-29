import { getDb } from "@/lib/db";
import { deleteDocument } from "@/lib/documents";
import { getQdrantUrl } from "@/lib/env";
import { createClient } from "@/lib/rag/vector";

/**
 * Thin by design: the ordering that matters lives in `deleteDocument`, where it
 * can be tested (specs.md §10, §11).
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;

  const result = await deleteDocument(id, { db: getDb(), qdrant: createClient(getQdrantUrl()) });

  if (result.ok) return Response.json({ deleted: id });
  if (result.reason === "not_found") return Response.json({ error: "No such document." }, { status: 404 });

  return Response.json(
    {
      error:
        `Could not remove vectors: ${result.message}. The document is marked delete_failed ` +
        `and remains searchable; retry to complete.`,
    },
    { status: 502 },
  );
}
