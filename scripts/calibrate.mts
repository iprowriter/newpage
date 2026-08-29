/** Measures top-1 score for answerable vs unanswerable questions, to set MIN_SCORE from data. */
import { getDb } from "@/lib/db";
import { getEmbeddingBaseUrl, getEmbeddingModel, getQdrantUrl } from "@/lib/env";
import { retrieve } from "@/lib/rag/retrieve";
import { createClient } from "@/lib/rag/vector";

const db = getDb();
const deps = {
  qdrant: createClient(getQdrantUrl()),
  embedding: { baseUrl: getEmbeddingBaseUrl(), model: getEmbeddingModel() },
  loadChunks: async (ids: string[]) => {
    const rows = await db.chunk.findMany({ where: { id: { in: ids } }, include: { document: true } });
    return rows.map((r) => ({
      id: r.id, documentId: r.documentId, collectionId: r.collectionId, page: r.page,
      headingPath: r.headingPath, displayText: r.displayText, filename: r.document.filename,
    }));
  },
};

const CASES: [string, string, string][] = [
  ["answerable", "Clinical Operations", "What must informed consent documentation include?"],
  ["answerable", "Clinical Operations", "What are the sponsor's responsibilities for monitoring a trial?"],
  ["answerable", "Manufacturing Quality", "What are the three stages of process validation?"],
  ["answerable", "Manufacturing Quality", "When must electronic records be validated under Part 11?"],
  ["out-of-corpus", "Clinical Operations", "What are the labelling requirements for veterinary drugs?"],
  ["out-of-corpus", "Manufacturing Quality", "How should medical device cybersecurity risk be assessed?"],
  ["false-premise", "Clinical Operations", "What does Section 42 say about reimbursing trial participants in cryptocurrency?"],
  ["off-domain", "Clinical Operations", "What is the capital city of France?"],
  ["off-domain", "Manufacturing Quality", "How do I make a sourdough starter?"],
];

const byKind = new Map<string, number[]>();
for (const [kind, name, question] of CASES) {
  const collection = await db.collection.findFirstOrThrow({ where: { name } });
  const { chunks } = await retrieve({ collectionId: collection.id, question, topK: 4 }, deps);
  const top = chunks[0]?.score ?? 0;
  byKind.set(kind, [...(byKind.get(kind) ?? []), top]);
  console.log(`${kind.padEnd(14)} ${top.toFixed(3)}  ${question.slice(0, 58)}`);
}

console.log("\nkind            min     max");
for (const [kind, scores] of byKind) {
  console.log(`${kind.padEnd(14)}  ${Math.min(...scores).toFixed(3)}   ${Math.max(...scores).toFixed(3)}`);
}
await db.$disconnect();
