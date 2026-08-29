import { createHash } from "node:crypto";

import { getDb } from "@/lib/db";
import { outlineFrom, summariseCollection } from "@/lib/rag/summarise";
import { isProviderError } from "@/lib/rag/providers/errors";
import { resolveProvider } from "@/lib/rag-runtime";

/**
 * Generates, caches and serves a collection summary.
 *
 * Cached against a fingerprint of the member document ids rather than a count,
 * so adding, removing *or swapping* a document invalidates it. A stale summary
 * is worse than none: it describes a collection the reader is not looking at,
 * and nothing on screen says so.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/collections/[id]/summary">) {
  const { id } = await ctx.params;
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

  const fingerprint = fingerprintOf(collection.documents.map((document) => document.id));
  if (collection.summary && collection.summaryFingerprint === fingerprint) {
    return Response.json({ summary: collection.summary, cached: true });
  }

  let provider;
  try {
    provider = resolveProvider();
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

function fingerprintOf(documentIds: string[]): string {
  return createHash("sha1").update([...documentIds].sort().join(":")).digest("hex");
}
