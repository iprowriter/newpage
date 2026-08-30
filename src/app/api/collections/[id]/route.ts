import { getDb } from "@/lib/db";
import { getQdrantUrl } from "@/lib/env";
import { createClient, deleteByCollection } from "@/lib/rag/vector";
import { summaryFingerprint } from "@/lib/summary";

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

  /**
   * The stored summary rides along with the collection instead of getting its
   * own endpoint, for two reasons. The view already fetches this on open and
   * again after every ingest, so there is no second round trip and no second
   * loading state; and because ingest triggers the same refetch, a summary
   * *stops* being served in the same breath as the upload that invalidated it.
   *
   * `summary` is null unless the fingerprint still matches, so a caller cannot
   * render a stale one by forgetting to check. `summaryStale` distinguishes
   * "never summarised" from "summarised, then the documents changed" — the UI
   * says different things about those, and only this route can tell them apart.
   */
  const readyIds = collection.documents
    .filter((document) => document.status === "ready")
    .map((document) => document.id);
  const current =
    collection.summary !== null && collection.summaryFingerprint === summaryFingerprint(readyIds);

  return Response.json({
    id: collection.id,
    name: collection.name,
    kind: collection.kind,
    description: collection.description,
    isDefault: collection.isDefault,
    chunkTokens: collection.chunkTokens,
    topK: collection.topK,
    summary: current ? collection.summary : null,
    summaryStale: collection.summary !== null && !current,
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
