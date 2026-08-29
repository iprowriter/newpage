import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const collections = await db.collection.findMany({
    // Collections read as a stable, curated list; chats as a recency-ordered
    // stream, which is how each is actually used.
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { documents: true, chunks: true } } },
  });

  return Response.json(
    collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      kind: collection.kind,
      description: collection.description,
      isDefault: collection.isDefault,
      documentCount: collection._count.documents,
      chunkCount: collection._count.chunks,
      updatedAt: collection.updatedAt,
    })),
  );
}

export async function POST(request: Request) {
  const { name, description } = (await request.json()) as { name?: string; description?: string };
  if (!name?.trim()) {
    return Response.json({ error: "A collection needs a name." }, { status: 400 });
  }

  const db = getDb();
  const existing = await db.collection.findFirst({
    where: { name: name.trim(), kind: "collection" },
  });
  if (existing) {
    return Response.json({ error: `A collection named "${name.trim()}" already exists.` }, { status: 409 });
  }

  const collection = await db.collection.create({
    data: { name: name.trim(), kind: "collection", description: description?.trim() || null },
  });
  return Response.json({ id: collection.id, name: collection.name }, { status: 201 });
}
