import { getDb } from "@/lib/db";
import { getQdrantUrl } from "@/lib/env";
import { createClient, reassignCollection } from "@/lib/rag/vector";

/**
 * Promotes a chat into a collection: its documents and chunks are re-pointed at
 * the target, and the now-empty chat is removed.
 *
 * Ordering, as everywhere two stores are involved (specs.md §10): Qdrant first,
 * Postgres second. A failure between them leaves chunks whose payload and row
 * disagree, which `retrieve.ts` detects and refuses to serve — visible breakage
 * rather than a document quietly readable from a collection it left.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/chats/[id]/promote">) {
  const { id } = await ctx.params;
  const { collectionId } = (await request.json()) as { collectionId?: string };

  if (!collectionId) {
    return Response.json({ error: "A target collectionId is required." }, { status: 400 });
  }

  const db = getDb();
  const [chat, target] = await Promise.all([
    db.collection.findUnique({ where: { id }, include: { documents: true } }),
    db.collection.findUnique({ where: { id: collectionId } }),
  ]);

  if (!chat || chat.kind !== "chat") return Response.json({ error: "No such chat." }, { status: 404 });
  if (!target) return Response.json({ error: "No such collection." }, { status: 404 });
  if (target.kind !== "collection") {
    return Response.json({ error: "A chat can only move into a collection." }, { status: 400 });
  }

  const documentIds = chat.documents.map((document) => document.id);

  try {
    await reassignCollection(createClient(getQdrantUrl()), documentIds, target.id);
  } catch (error) {
    return Response.json(
      { error: `Could not move the vectors: ${error instanceof Error ? error.message : error}. Nothing was changed.` },
      { status: 502 },
    );
  }

  await db.$transaction([
    db.chunk.updateMany({ where: { collectionId: chat.id }, data: { collectionId: target.id } }),
    db.document.updateMany({ where: { collectionId: chat.id }, data: { collectionId: target.id } }),
    // Traces stay with the chat and go with it. They describe questions asked
    // against a scope that no longer exists, and re-homing them would put
    // misleading history under the target collection.
    db.collection.delete({ where: { id: chat.id } }),
  ]);

  return Response.json({ movedTo: target.id, documents: documentIds.length });
}
