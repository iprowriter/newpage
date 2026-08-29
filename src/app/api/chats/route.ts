import { getDb } from "@/lib/db";

/**
 * Creates an empty chat.
 *
 * A chat is a Collection with `kind: "chat"` — not a second entity — so it
 * inherits the isolation guarantee, the retrieval path and the trace schema
 * unchanged. The only differences are how it is presented and that it can be
 * promoted into a collection later.
 */
export async function POST() {
  const db = getDb();
  const chat = await db.collection.create({
    data: { name: "New chat", kind: "chat" },
  });
  return Response.json({ id: chat.id, name: chat.name }, { status: 201 });
}
