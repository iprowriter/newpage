import { getDb } from "@/lib/db";
import { getQdrantUrl } from "@/lib/env";
import { createClient, deleteByCollection } from "@/lib/rag/vector";

export async function GET(_request: Request, ctx: RouteContext<"/api/collections/[id]">) {
  const { id } = await ctx.params;
  const db = getDb();

  const collection = await db.collection.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { chunks: true } } },
      },
    },
  });
  if (!collection) return Response.json({ error: "No such collection." }, { status: 404 });

  return Response.json({
    id: collection.id,
    name: collection.name,
    kind: collection.kind,
    description: collection.description,
    isDefault: collection.isDefault,
    chunkTokens: collection.chunkTokens,
    topK: collection.topK,
    documents: collection.documents.map((document) => ({
      id: document.id,
      filename: document.filename,
      status: document.status,
      error: document.error,
      pageCount: document.pageCount,
      chunkCount: document._count.chunks,
      starterQuestions: document.starterQuestions,
      createdAt: document.createdAt,
    })),
  });
}

/**
 * Deletes a collection or chat and everything in it.
 *
 * Qdrant first, then Postgres — the same ordering used everywhere two stores are
 * involved (specs.md §10). A failure between them leaves Postgres rows nothing
 * can retrieve, which is inert; the reverse would leave live vectors whose text
 * is gone, and those surface as citations to a document that no longer exists.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/collections/[id]">) {
  const { id } = await ctx.params;
  const db = getDb();

  const collection = await db.collection.findUnique({ where: { id } });
  if (!collection) return Response.json({ error: "No such collection." }, { status: 404 });

  try {
    await deleteByCollection(createClient(getQdrantUrl()), id);
  } catch (error) {
    return Response.json(
      { error: `Could not remove vectors: ${error instanceof Error ? error.message : error}. Nothing was deleted.` },
      { status: 502 },
    );
  }

  // Documents, chunks and traces cascade from the collection row.
  await db.collection.delete({ where: { id } });
  return Response.json({ deleted: id });
}
