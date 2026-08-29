import { describe, expect, it, vi } from "vitest";
import type { QdrantClient } from "@qdrant/js-client-rest";

import { buildAnswerGraph, MAX_REWRITES } from "./graph";
import type { LoadedChunk } from "./retrieve";
import type { Provider } from "./providers/types";

/**
 * The retry-bound test (specs.md §11).
 *
 * The rewrite edge feeds back into retrieve, which is a cycle, and a cycle
 * against a paid API is how this design would become expensive by accident. The
 * bound is asserted by counting provider calls rather than by reading the code,
 * because the failure this guards against is a future edit that looks harmless.
 */

const strongChunk: LoadedChunk = {
  id: "c1",
  documentId: "d1",
  collectionId: "clinical",
  page: 4,
  headingPath: ["III. DISCUSSION"],
  displayText: "Consent must be documented before enrollment begins.",
  filename: "informed-consent.pdf",
};

function harness({ score, answerJson }: { score: number; answerJson?: string }) {
  const generate = vi.fn(async ({ schema }: { schema?: unknown }) =>
    schema
      ? { text: answerJson ?? JSON.stringify({ sufficient: true, answer: "Yes.", missing: "", citations: [1], followUps: ["A?", "B?", "C?"] }) }
      : { text: "rewritten query" },
  );

  const provider: Provider = { id: "ollama", model: "test", generate };

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ embeddings: [[0.1]] }) }));

  const graph = buildAnswerGraph({
    provider,
    qdrant: { query: vi.fn().mockResolvedValue({ points: [{ id: "c1", score }] }) } as unknown as QdrantClient,
    embedding: { baseUrl: "http://stub", model: "stub" },
    loadChunks: async () => [strongChunk],
  });

  return { graph, generate };
}

const run = (graph: ReturnType<typeof buildAnswerGraph>, question = "consent?") =>
  graph.invoke({ question, searchQuery: question, collectionId: "clinical", topK: 4 });

describe("answer graph", () => {
  it("rewrites at most once, then refuses", async () => {
    const { graph, generate } = harness({ score: 0.2 });

    const result = await run(graph);

    expect(result.outcome).toBe("refused");
    expect(result.rewrites).toBe(MAX_REWRITES);
    // Exactly one rewrite call, and no answer call — it never reached generate.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.refusalReason).toMatch(/below the .* threshold/);
  });

  it("answers directly when retrieval is strong, without rewriting", async () => {
    const { graph, generate } = harness({ score: 0.9 });

    const result = await run(graph);

    expect(result.outcome).toBe("answered");
    expect(result.rewrites).toBe(0);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.followUps).toHaveLength(2); // trimmed from the three returned
  });

  // The case a similarity score cannot see: the right topic, but the passage
  // never states the answer. Honoured rather than overridden.
  it("refuses when the model reports the sources are insufficient", async () => {
    const { graph } = harness({
      score: 0.9,
      answerJson: JSON.stringify({
        sufficient: false,
        answer: "",
        missing: "The sources describe the process but never give the retention period.",
        citations: [],
        followUps: [],
      }),
    });

    const result = await run(graph);

    expect(result.outcome).toBe("refused");
    expect(result.refusalReason).toMatch(/never give the retention period/);
  });

  // Small local models drift out of schema. An unparseable response is the case
  // where the system knows least about what it is holding, so it must not answer.
  it("refuses rather than throwing when the response is not valid JSON", async () => {
    const { graph } = harness({ score: 0.9, answerJson: "Sure! Here's what I found: ..." });

    const result = await run(graph);

    expect(result.outcome).toBe("refused");
  });
});
