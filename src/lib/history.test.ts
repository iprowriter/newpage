import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { HISTORY_LIMIT, loadHistory } from "./history";

/**
 * The history tests (specs.md §11).
 *
 * Everything asserted here fails *quietly* rather than loudly. A broken rejoin
 * returns answers whose passages are empty strings; a lost citation array
 * returns answers with no attribution line; the wrong sort order returns a
 * conversation running backwards. None of them throws, and all of them look
 * plausible in a screenshot, which is why they are worth pinning down.
 */

const source = (n: number, chunkId: string) => ({
  n,
  chunkId,
  documentId: "doc-1",
  filename: "guidance.pdf",
  page: n,
  headingPath: ["Guidance", "Section"],
  score: 0.8 - n / 100,
});

const trace = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "t1",
  question: "a question",
  answer: "an answer",
  outcome: "answered",
  refusalReason: null,
  citations: [1],
  retrieved: [source(1, "chunk-1"), source(2, "chunk-2")],
  gradeScore: 0.72,
  rewriteFired: false,
  rewrittenAs: null,
  provider: "gemini",
  model: "gemini-3.6-flash",
  embeddingModel: "nomic-embed-text",
  feedback: null,
  latencyMs: 1200,
  retrievalMs: 200,
  generationMs: 900,
  createdAt: new Date("2026-08-30T10:00:00Z"),
  ...over,
});

function harness(traces: ReturnType<typeof trace>[], chunks: { id: string; displayText: string }[]) {
  // The query itself is captured, not just the rows it returned: half of what
  // matters here is *what was asked for* (this collection, these outcomes, this
  // order, this limit), and none of that is visible in the result.
  const queries: unknown[] = [];
  const db = {
    queryTrace: {
      findMany: vi.fn(async (args: unknown) => {
        queries.push(args);
        return traces;
      }),
    },
    chunk: { findMany: vi.fn(async () => chunks) },
  } as unknown as PrismaClient;
  return { db, queries };
}

describe("loadHistory", () => {
  it("rejoins chunk text onto the sources the trace only stored ids for", async () => {
    const { db } = harness(
      [trace()],
      [
        { id: "chunk-1", displayText: "The sponsor shall notify FDA." },
        { id: "chunk-2", displayText: "Records are retained for two years." },
      ],
    );

    const { history } = await loadHistory("col-1", { db });
    const sources = history[0].payload.sources;

    expect(sources[0].displayText).toBe("The sponsor shall notify FDA.");
    expect(sources[1].displayText).toBe("Records are retained for two years.");
    expect(sources.every((s) => s.available)).toBe(true);
  });

  // The case that made `available` exist. Dropping the source instead would make
  // an old answer look better sourced than it now is.
  it("marks a source unavailable when its document has since been deleted", async () => {
    const { db } = harness([trace()], [{ id: "chunk-1", displayText: "Still here." }]);

    const { history } = await loadHistory("col-1", { db });
    const [kept, lost] = history[0].payload.sources;

    expect(kept.available).toBe(true);
    expect(lost.available).toBe(false);
    expect(lost.displayText).toBe("");
    // Still listed, with its rank, page and score intact.
    expect(lost.n).toBe(2);
    expect(lost.filename).toBe("guidance.pdf");
  });

  it("returns oldest first, having asked the database for newest first", async () => {
    const { db, queries } = harness(
      [
        trace({ id: "newest", question: "third", createdAt: new Date("2026-08-30T12:00:00Z") }),
        trace({ id: "middle", question: "second", createdAt: new Date("2026-08-30T11:00:00Z") }),
        trace({ id: "oldest", question: "first", createdAt: new Date("2026-08-30T10:00:00Z") }),
      ],
      [],
    );

    const { history } = await loadHistory("col-1", { db });

    expect(history.map((e) => e.question)).toEqual(["first", "second", "third"]);
    // Newest-first is what the (collectionId, createdAt) index and the limit
    // want; taking the *oldest* 20 would show a stale head of the conversation.
    expect(queries[0]).toMatchObject({ orderBy: { createdAt: "desc" } });
  });

  it("asks only for this collection, and only for answered or refused turns", async () => {
    const { db, queries } = harness([trace()], []);

    await loadHistory("col-42", { db });

    expect(queries[0]).toMatchObject({
      where: { collectionId: "col-42", outcome: { in: ["answered", "refused"] } },
      take: HISTORY_LIMIT,
    });
  });

  it("carries citations and feedback back with the answer", async () => {
    const { db } = harness([trace({ citations: [1, 2], feedback: "up" })], []);

    const { history } = await loadHistory("col-1", { db });

    expect(history[0].payload.citations).toEqual([1, 2]);
    expect(history[0].payload.feedback).toBe("up");
  });

  it("keeps a refusal as a turn, with its reason and its retrieved passages", async () => {
    const { db } = harness(
      [
        trace({
          outcome: "refused",
          answer: null,
          citations: [],
          refusalReason: "The passages do not state an answer.",
        }),
      ],
      [{ id: "chunk-1", displayText: "Nearby but not an answer." }],
    );

    const { history } = await loadHistory("col-1", { db });

    expect(history[0].payload.outcome).toBe("refused");
    expect(history[0].payload.refusalReason).toBe("The passages do not state an answer.");
    expect(history[0].payload.sources).toHaveLength(2);
  });

  it("reports truncation only when the page is full", async () => {
    const full = Array.from({ length: HISTORY_LIMIT }, (_, i) =>
      trace({ id: `t${i}`, retrieved: [] }),
    );
    const { db: dbFull } = harness(full, []);
    const { db: dbShort } = harness(full.slice(0, 3), []);

    expect((await loadHistory("col-1", { db: dbFull })).truncated).toBe(true);
    expect((await loadHistory("col-1", { db: dbShort })).truncated).toBe(false);
  });

  it("returns nothing for a collection that has never been asked anything", async () => {
    const { db } = harness([], []);

    const { history, truncated } = await loadHistory("col-1", { db });

    expect(history).toEqual([]);
    expect(truncated).toBe(false);
  });
});
