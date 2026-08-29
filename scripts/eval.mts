/**
 * The eval harness (ADR-0015).
 *
 *   npm run eval                          current index, hosted provider
 *   npm run eval -- --provider ollama     the local column of the comparison
 *   npm run eval -- --retrieval-only      deterministic half only: seconds, free
 *   npm run eval -- --label "800-token chunks"
 *
 * Runs headless against `src/lib/rag` with no server, which is the property the
 * ESLint rule on that directory exists to protect (ADR-0007).
 *
 * **Retrieval and generation are measured separately and never blended.** One
 * number tells you something is wrong without telling you where, and the whole
 * diagnostic value is in the split: the local model's false refusal earlier in
 * this project was a generation failure on a question retrieval had scored 0.816.
 */
import { CASES, type EvalCase } from "../evals/dataset";
import { judge } from "../evals/judge";
import { getDb } from "@/lib/db";
import { getEmbeddingBaseUrl, getEmbeddingModel, getQdrantUrl } from "@/lib/env";
import { buildAnswerGraph } from "@/lib/rag/graph";
import { retrieve } from "@/lib/rag/retrieve";
import { createClient } from "@/lib/rag/vector";
import { chunkLoader, resolveProvider } from "@/lib/rag-runtime";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name: string) => argv.includes(`--${name}`);

const providerId = flag("provider");
const retrievalOnly = has("retrieval-only");
const topKOverride = flag("top-k") ? Number(flag("top-k")) : undefined;

const db = getDb();
const provider = resolveProvider(providerId);

/**
 * The judge is pinned to the hosted model regardless of what is under test.
 *
 * Letting the system under test grade itself would make the local and hosted
 * columns incomparable — a groundedness score is only meaningful against a fixed
 * grader, and swapping the grader alongside the subject changes two variables at
 * once. It also asks a 3B model to reliably detect its own unsupported claims,
 * which is the thing it is worst at.
 */
const judgeProvider = resolveProvider(flag("judge-provider", "gemini"));
const deps = {
  provider,
  qdrant: createClient(getQdrantUrl()),
  embedding: { baseUrl: getEmbeddingBaseUrl(), model: getEmbeddingModel() },
  loadChunks: chunkLoader(db),
};

const collections = new Map(
  (await db.collection.findMany({ where: { kind: "collection" } })).map((c) => [c.name, c]),
);

for (const name of new Set(CASES.map((c) => c.collection))) {
  if (!collections.has(name)) {
    console.error(`Collection "${name}" is missing. Run \`npm run seed\` first.`);
    process.exit(1);
  }
}

const label = flag("label", `${provider.id} · ${new Date().toISOString().slice(0, 16)}`)!;
const chunkTokens = collections.values().next().value!.chunkTokens;
const topK = topKOverride ?? collections.values().next().value!.topK;

const run = await db.evalRun.create({
  data: {
    label,
    provider: provider.id,
    model: provider.model,
    embeddingModel: getEmbeddingModel(),
    judgeModel: retrievalOnly ? null : judgeProvider.model,
    chunkTokens,
    topK,
  },
});

console.log(`\n${label}`);
console.log(
  `provider=${provider.id} model=${provider.model} chunkTokens=${chunkTokens} topK=${topK}` +
    `${retrievalOnly ? " (retrieval only)" : ` judge=${judgeProvider.model}`}\n`,
);

interface Row {
  kase: EvalCase;
  rank: number | null;
  refused: boolean;
  passed: boolean;
  answer: string | null;
  groundedness: number | null;
  citations: number | null;
  assertionsHeld: boolean | null;
  notes: string;
  latencyMs: number;
}

const rows: Row[] = [];

for (const kase of CASES) {
  const collection = collections.get(kase.collection)!;
  const started = Date.now();

  // --- retrieval: deterministic, no judge, no model ------------------------
  const { chunks } = await retrieve(
    { collectionId: collection.id, question: kase.question, topK },
    deps,
  );

  // Rank of the first chunk that came from the expected file and contains one
  // of the expected phrases. Chunking-independent by construction.
  let rank: number | null = null;
  if (kase.expect) {
    const index = chunks.findIndex(
      (chunk) =>
        chunk.filename === kase.expect!.file &&
        kase.expect!.contains.some((phrase) =>
          chunk.displayText.toLowerCase().includes(phrase.toLowerCase()),
        ),
    );
    rank = index === -1 ? null : index + 1;
  }

  if (retrievalOnly) {
    rows.push({
      kase, rank, refused: false,
      passed: kase.kind === "answerable" ? rank !== null : true,
      answer: null, groundedness: null, citations: null, assertionsHeld: null,
      notes: "", latencyMs: Date.now() - started,
    });
    process.stdout.write(kase.kind === "answerable" ? (rank ? "." : "F") : "-");
    continue;
  }

  // --- generation ----------------------------------------------------------
  const state = await buildAnswerGraph(deps).invoke({
    question: kase.question,
    searchQuery: kase.question,
    collectionId: collection.id,
    topK,
  });

  const refused = state.outcome !== "answered";
  const answer = state.answer ?? null;

  let groundedness: number | null = null;
  let citations: number | null = null;
  let assertionsHeld: boolean | null = null;
  const notes: string[] = [];

  if (kase.kind === "answerable") {
    if (refused) {
      notes.push("false refusal");
    } else {
      // The deterministic floor. Holds even on a day the judge is unreliable.
      assertionsHeld = (kase.answerMustContain ?? []).every((phrase) =>
        (answer ?? "").toLowerCase().includes(phrase.toLowerCase()),
      );
      if (!assertionsHeld) notes.push("assertion missed");

      const verdict = await judge(
        kase.question,
        state.chunks.map((chunk, i) => ({
          n: i + 1,
          filename: chunk.filename,
          page: chunk.page ?? null,
          text: chunk.displayText,
        })),
        answer ?? "",
        judgeProvider,
      );
      if (verdict) {
        groundedness = verdict.groundedness;
        citations = verdict.citations;
        if (verdict.groundedness < 1) notes.push(verdict.reason.slice(0, 90));
      } else {
        notes.push("judge unparseable");
      }
    }
  } else if (!refused) {
    notes.push("answered an unanswerable question");
  }

  const passed =
    kase.kind === "answerable"
      ? !refused && assertionsHeld !== false && (groundedness ?? 1) >= 0.5
      : refused;

  rows.push({
    kase, rank, refused, passed, answer, groundedness, citations, assertionsHeld,
    notes: notes.join("; "), latencyMs: Date.now() - started,
  });
  process.stdout.write(passed ? "." : "F");
}

console.log("\n");

// --- metrics ---------------------------------------------------------------
const answerable = rows.filter((r) => r.kase.kind === "answerable");
const negative = rows.filter((r) => r.kase.kind !== "answerable");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const recallAtK = mean(answerable.map((r) => (r.rank ? 1 : 0)));
const mrr = mean(answerable.map((r) => (r.rank ? 1 / r.rank : 0)));
const groundedness = retrievalOnly ? null : mean(answerable.filter((r) => r.groundedness !== null).map((r) => r.groundedness!));
const citationAccuracy = retrievalOnly ? null : mean(answerable.filter((r) => r.citations !== null).map((r) => r.citations!));
const refusalRate = retrievalOnly ? null : mean(negative.map((r) => (r.refused ? 1 : 0)));
const falseRefusalRate = retrievalOnly ? null : mean(answerable.map((r) => (r.refused ? 1 : 0)));

await db.evalRun.update({
  where: { id: run.id },
  data: { recallAtK, mrr, groundedness, citationAccuracy, refusalRate, falseRefusalRate, finishedAt: new Date() },
});

await db.evalResult.createMany({
  data: rows.map((r) => ({
    runId: run.id,
    question: r.kase.question,
    kind: r.kase.kind,
    collectionName: r.kase.collection,
    expectedChunkIds: r.kase.expect ? [`${r.kase.expect.file}:${r.kase.expect.contains[0]}`] : [],
    retrievedChunkIds: [],
    rank: r.rank,
    refused: r.refused,
    passed: r.passed,
    answer: r.answer,
    judgeScore: r.groundedness,
    judgeNotes: r.notes || null,
    latencyMs: r.latencyMs,
  })),
});

const pct = (v: number | null) => (v === null ? "  —  " : `${(v * 100).toFixed(0).padStart(3)}%`);

console.log("RETRIEVAL      (deterministic, no model involved)");
console.log(`  recall@${topK}      ${pct(recallAtK)}   ${answerable.filter((r) => r.rank).length}/${answerable.length} answerable questions found their source`);
console.log(`  MRR           ${mrr === null ? "—" : mrr.toFixed(3)}`);

if (!retrievalOnly) {
  console.log("\nGENERATION     (LLM-as-judge + fixed assertions)");
  console.log(`  groundedness  ${pct(groundedness)}`);
  console.log(`  citations     ${pct(citationAccuracy)}`);
  console.log("\nGUARDRAILS     (reported as a pair — either alone is gameable)");
  console.log(`  refusal       ${pct(refusalRate)}   of ${negative.length} unanswerable questions correctly declined`);
  console.log(`  false refusal ${pct(falseRefusalRate)}   of ${answerable.length} answerable questions wrongly declined`);
}

const byKind = new Map<string, { pass: number; total: number }>();
for (const r of rows) {
  const entry = byKind.get(r.kase.kind) ?? { pass: 0, total: 0 };
  entry.total += 1;
  if (r.passed) entry.pass += 1;
  byKind.set(r.kase.kind, entry);
}
console.log("\nBY CATEGORY");
for (const [kind, { pass, total }] of byKind) {
  console.log(`  ${kind.padEnd(18)} ${pass}/${total}`);
}

const failures = rows.filter((r) => !r.passed);
if (failures.length > 0) {
  console.log(`\nFAILURES (${failures.length})`);
  for (const r of failures) {
    console.log(`  [${r.kase.kind}] ${r.kase.question.slice(0, 62)}`);
    console.log(`      ${r.notes || (r.rank === null ? "source not retrieved" : "")}`);
  }
}

console.log(`\nrun ${run.id}\n`);
await db.$disconnect();
