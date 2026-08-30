import { getDb } from "@/lib/db";
import { outlineFrom, summariseCollection } from "@/lib/rag/summarise";
import { isProviderError } from "@/lib/rag/providers/errors";
import { resolveProvider } from "@/lib/rag-runtime";
import { summaryFingerprint } from "@/lib/summary";

/**
 * Generates, caches and serves a collection summary.
 *
 * Cached against a fingerprint of the member document ids rather than a count,
 * so adding, removing *or swapping* a document invalidates it. A stale summary
 * is worse than none: it describes a collection the reader is not looking at,
 * and nothing on screen says so.
 *
 * Two query parameters:
 *
 * - `force=1` regenerates even when the cache is current. This is what
 *   "Summarise again" sends, and it is the only way past the fingerprint —
 *   without it a second press is a no-op that looks like a broken button.
 * - `provider` picks the model, the same way `/api/query` does. Previously this
 *   route took the server default, which meant a reviewer who had switched the
 *   toggle to the local provider could ask questions perfectly well and still be
 *   told `GEMINI_API_KEY is not set` when they pressed summarise.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/collections/[id]/summary">) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const db = getDb();

  const collection = await db.collection.findUnique({
    where: { id },
    include: {
      documents: { where: { status: "ready" }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!collection) return Response.json({ error: "No such collection." }, { status: 404 });
  if (collection.documents.length === 0) {
    const noun = collection.kind === "chat" ? "chat" : "collection";
    return Response.json({ error: `Nothing to summarise yet — this ${noun} is empty.` }, { status: 400 });
  }

  const fingerprint = summaryFingerprint(collection.documents.map((document) => document.id));
  if (!force && collection.summary && collection.summaryFingerprint === fingerprint) {
    return Response.json({ summary: collection.summary, cached: true });
  }

  let provider;
  try {
    provider = resolveProvider(searchParams.get("provider") ?? undefined);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No provider." },
      { status: 400 },
    );
  }

  const outlines = await Promise.all(
    collection.documents.map(async (document) => {
      const chunks = await db.chunk.findMany({
        where: { documentId: document.id },
        orderBy: { chunkIndex: "asc" },
        select: { headingPath: true, displayText: true },
      });
      return outlineFrom(document.filename, chunks);
    }),
  );

  try {
    const summary = await summariseCollection(collection.name, outlines, provider);
    await db.collection.update({
      where: { id },
      data: { summary, summaryFingerprint: fingerprint },
    });
    return Response.json({ summary, cached: false });
  } catch (error) {
    const provided = isProviderError(error);
    return Response.json(
      {
        error: provided ? error.userMessage : "Could not generate a summary.",
        kind: provided ? error.kind : "unknown",
        retryable: provided ? error.retryable : false,
      },
      { status: provided && error.kind === "unavailable" ? 503 : 502 },
    );
  }
}
