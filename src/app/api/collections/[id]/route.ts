import { getDb } from "@/lib/db";

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
