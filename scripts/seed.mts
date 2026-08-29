/**
 * Seeds the collections and ingests the committed FDA corpus (ADR-0017).
 *
 * Idempotent: re-running skips documents already ingested, so it is safe to use
 * as "get me back to a working state" rather than something that must be run
 * exactly once on a clean database.
 *
 *   npm run seed
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@/lib/rag/vector";
import { generateStarterQuestions } from "@/lib/rag/starter-questions";
import { getDb } from "@/lib/db";
import { getEmbeddingBaseUrl, getEmbeddingModel, getQdrantUrl } from "@/lib/env";
import { ingestDocument } from "@/lib/ingest";
import { resolveProvider } from "@/lib/rag-runtime";

/**
 * No "Quick start" collection any more. It existed so there was somewhere to drop
 * a one-off document, and that is now what a chat is for — created on demand,
 * and promotable into a collection once it turns out to be worth keeping.
 */
const COLLECTIONS = [
  {
    name: "Clinical Operations",
    description: "Trial conduct, informed consent, source data and good clinical practice.",
    directory: "clinical-operations",
    isDefault: true,
  },
  {
    name: "Manufacturing Quality",
    description: "Process validation, GMP for active ingredients, data integrity and electronic records.",
    directory: "manufacturing-quality",
    isDefault: false,
  },
];

const db = getDb();
const qdrant = createClient(getQdrantUrl());
const embedding = { baseUrl: getEmbeddingBaseUrl(), model: getEmbeddingModel() };

/**
 * Starter questions need a generation provider, and the seed previously did not
 * pass one — so every seeded document skipped the step silently, and the
 * flagship collections opened with no suggestions while anything uploaded
 * through the UI had three. Optional, so seeding still works with no API key;
 * the documents just ingest without suggestions.
 */
let provider;
try {
  provider = resolveProvider();
} catch {
  console.log("No generation provider configured — ingesting without starter questions.\n");
}

for (const spec of COLLECTIONS) {
  // Find-or-create rather than upsert: `name` is no longer unique (chats collide
  // by design), so there is no unique key to upsert against.
  const collection =
    (await db.collection.findFirst({ where: { name: spec.name, kind: "collection" } })) ??
    (await db.collection.create({
      data: {
        name: spec.name,
        kind: "collection",
        description: spec.description,
        isDefault: spec.isDefault,
      },
    }));
  console.log(`\n${collection.name}`);

  if (!spec.directory) continue;

  const dir = join(process.cwd(), "corpus", spec.directory);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".pdf")).sort();

  for (const filename of files) {
    const existing = await db.document.findFirst({
      where: { collectionId: collection.id, filename, status: "ready" },
    });
    if (existing) {
      // Backfill rather than plain skip: a document indexed before starter
      // questions existed is otherwise stuck without them forever, since it is
      // never re-ingested. Makes `npm run seed` self-healing instead of merely
      // idempotent.
      if (existing.starterQuestions.length === 0 && provider) {
        const chunks = await db.chunk.findMany({
          where: { documentId: existing.id },
          orderBy: { chunkIndex: "asc" },
          select: { headingPath: true, displayText: true },
        });
        const questions = await generateStarterQuestions(
          filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
          chunks,
          provider,
        ).catch(() => []);

        if (questions.length > 0) {
          await db.document.update({ where: { id: existing.id }, data: { starterQuestions: questions } });
          console.log(`  fill   ${filename}  ${questions.length} starter questions`);
          continue;
        }
      }
      console.log(`  skip   ${filename}`);
      continue;
    }

    const started = Date.now();
    try {
      const result = await ingestDocument(
        {
          collectionId: collection.id,
          filename,
          mimeType: "application/pdf",
          data: new Uint8Array(await readFile(join(dir, filename))),
        },
        { db, qdrant, embedding, provider },
      );
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`  ok     ${filename}  ${result.chunkCount} chunks, ${result.pageCount} pages, ${seconds}s`);
    } catch (error) {
      console.log(`  FAILED ${filename}  ${error instanceof Error ? error.message : error}`);
    }
  }
}

const totals = await db.chunk.groupBy({ by: ["collectionId"], _count: true });
console.log(`\nchunks indexed: ${totals.reduce((sum, t) => sum + t._count, 0)}`);
await db.$disconnect();
