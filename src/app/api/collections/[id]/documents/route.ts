import { getDb } from "@/lib/db";
import { ingestDocument } from "@/lib/ingest";
import { isSupported } from "@/lib/rag/extract";
import { createClient } from "@/lib/rag/vector";
import { embeddingOptions, resolveProvider } from "@/lib/rag-runtime";
import { getQdrantUrl } from "@/lib/env";

/**
 * Upload and ingest. Runs inline rather than on a queue.
 *
 * Correct here and wrong in production: this is a container, so a route handler
 * is just Node with no execution limit. Deployed serverless it would hit a
 * timeout on a large PDF, which is why "ingestion moves to a queue and a worker"
 * is in the productionisation section rather than being pre-built for a demo.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/collections/[id]/documents">) {
  const { id } = await ctx.params;
  const db = getDb();

  const collection = await db.collection.findUnique({ where: { id } });
  if (!collection) return Response.json({ error: "No such collection." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was uploaded." }, { status: 400 });
  }

  const mimeType = file.type || guessMimeType(file.name);
  if (!isSupported(mimeType)) {
    // Rejected by name rather than attempted and half-parsed: a .docx that
    // ingests as garbled text fails later, at retrieval, looking like a model
    // problem (ADR-0018).
    return Response.json(
      { error: `"${file.name}" is a ${mimeType} file. This build accepts PDF, plain text and Markdown.` },
      { status: 415 },
    );
  }

  try {
    const result = await ingestDocument(
      {
        collectionId: collection.id,
        filename: file.name,
        mimeType,
        data: new Uint8Array(await file.arrayBuffer()),
      },
      {
        db,
        qdrant: createClient(getQdrantUrl()),
        embedding: embeddingOptions(),
        provider: safeProvider(),
      },
    );
    // A chat starts as "New chat" and takes the name of the first document put
    // into it — the same convenience a chat client gives you by titling a thread
    // after its opening message. Collections keep the name their author chose.
    if (collection.kind === "chat" && collection.name === "New chat") {
      await db.collection.update({
        where: { id: collection.id },
        data: { name: prettyName(file.name) },
      });
    }

    return Response.json(result, { status: 201 });
  } catch (error) {
    // The document row is already marked `failed` with this message by
    // ingestDocument, so the list shows *why* rather than a document that
    // silently never works.
    return Response.json(
      { error: error instanceof Error ? error.message : "Ingestion failed." },
      { status: 422 },
    );
  }
}

/** Starter questions are optional; a missing API key must not block an upload. */
function safeProvider() {
  try {
    return resolveProvider();
  } catch {
    return undefined;
  }
}

function prettyName(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  const titled = stem.charAt(0).toUpperCase() + stem.slice(1);
  return titled.length > 48 ? `${titled.slice(0, 47)}…` : titled || "New chat";
}

function guessMimeType(filename: string): string {
  if (filename.endsWith(".pdf")) return "application/pdf";
  if (filename.endsWith(".md")) return "text/markdown";
  if (filename.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}
