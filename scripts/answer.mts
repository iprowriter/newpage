/** End-to-end graph probe. `npx tsx scripts/answer.mts "<collection>" "<question>"` */
import { getDb } from "@/lib/db";
import { getEmbeddingBaseUrl, getEmbeddingModel, getModelId, getOllamaBaseUrl, getProvider, getQdrantUrl } from "@/lib/env";
import { buildAnswerGraph } from "@/lib/rag/graph";
import { geminiProvider } from "@/lib/rag/providers/gemini";
import { ollamaProvider } from "@/lib/rag/providers/ollama";
import { createClient } from "@/lib/rag/vector";

const [collectionName, question] = process.argv.slice(2);
const db = getDb();
const collection = await db.collection.findFirstOrThrow({ where: { name: collectionName } });

const id = getProvider();
const provider =
  id === "gemini"
    ? geminiProvider(process.env.GEMINI_API_KEY ?? "", getModelId("gemini"))
    : ollamaProvider(getOllamaBaseUrl(), getModelId("ollama"));

const graph = buildAnswerGraph({
  provider,
  qdrant: createClient(getQdrantUrl()),
  embedding: { baseUrl: getEmbeddingBaseUrl(), model: getEmbeddingModel() },
  loadChunks: async (ids) => {
    const rows = await db.chunk.findMany({ where: { id: { in: ids } }, include: { document: true } });
    return rows.map((r) => ({
      id: r.id, documentId: r.documentId, collectionId: r.collectionId, page: r.page,
      headingPath: r.headingPath, displayText: r.displayText, filename: r.document.filename,
    }));
  },
});

const started = Date.now();
const out = await graph.invoke({
  question, searchQuery: question, collectionId: collection.id, topK: collection.topK,
});

console.log(`\n[${collectionName}] ${question}`);
console.log(`provider=${provider.id} model=${provider.model} outcome=${out.outcome} score=${out.gradeScore?.toFixed(3)} rewrites=${out.rewrites} total=${Date.now() - started}ms (retrieval ${out.retrievalMs}ms, generation ${out.generationMs}ms)`);
if (out.rewrittenAs) console.log(`rewritten: ${out.rewrittenAs}`);
console.log(out.outcome === "answered" ? `\n${out.answer}` : `\nREFUSED: ${out.refusalReason}`);
if (out.citations.length) console.log(`\ncited: ${out.citations.map((c) => `[${c}] ${out.chunks[c - 1]?.filename ?? "?"} p${out.chunks[c - 1]?.page ?? "?"}`).join(", ")}`);
if (out.followUps.length) console.log(`follow-ups:\n  - ${out.followUps.join("\n  - ")}`);
await db.$disconnect();
