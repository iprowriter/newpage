/** Retrieval probe. `npx tsx scripts/ask.mts "<collection>" "<question>"` */
import { getDb } from "@/lib/db";
import { getEmbeddingBaseUrl, getEmbeddingModel, getQdrantUrl } from "@/lib/env";
import { retrieve } from "@/lib/rag/retrieve";
import { createClient } from "@/lib/rag/vector";

const [collectionName, question] = process.argv.slice(2);
const db = getDb();
const collection = await db.collection.findFirstOrThrow({ where: { name: collectionName } });

const result = await retrieve(
  { collectionId: collection.id, question, topK: 4 },
  {
    qdrant: createClient(getQdrantUrl()),
    embedding: { baseUrl: getEmbeddingBaseUrl(), model: getEmbeddingModel() },
    loadChunks: async (ids) => {
      const rows = await db.chunk.findMany({
        where: { id: { in: ids } },
        include: { document: { select: { filename: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        collectionId: r.collectionId,
        page: r.page,
        headingPath: r.headingPath,
        displayText: r.displayText,
        filename: r.document.filename,
      }));
    },
  },
);

console.log(`\n[${collectionName}] "${question}"  (embed ${result.embeddingMs}ms, search ${result.searchMs}ms)`);
for (const c of result.chunks) {
  console.log(`  ${c.score.toFixed(3)}  ${c.filename} p${c.page ?? "?"}  ${c.headingPath.slice(-1)[0] ?? "-"}`);
  console.log(`         ${c.displayText.replace(/\s+/g, " ").slice(0, 110)}...`);
}
await db.$disconnect();
