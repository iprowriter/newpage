import { describe, expect, it, vi } from "vitest";
import type { QdrantClient } from "@qdrant/js-client-rest";

import { retrieve, type LoadedChunk, type RetrieveDeps } from "./retrieve";

/**
 * The isolation test (specs.md §11).
 *
 * It carries more weight than it would have under the rejected design. With a
 * Qdrant collection per department, cross-department retrieval is an impossible
 * query and this test would be theatre. With one collection and a payload filter
 * (ADR-0010), it is one forgotten line — and the failure is silent, well-cited,
 * and confident. So the filter is asserted directly rather than inferred from
 * results that a stub could just as easily have got right by accident.
 */

const chunk = (overrides: Partial<LoadedChunk> = {}): LoadedChunk => ({
  id: "chunk-1",
  documentId: "doc-1",
  collectionId: "clinical",
  page: 3,
  headingPath: ["III. DISCUSSION"],
  displayText: "Consent must be documented before enrollment.",
  filename: "informed-consent.pdf",
  ...overrides,
});

function deps(overrides: {
  points?: { id: string; score: number }[];
  loaded?: LoadedChunk[];
  query?: ReturnType<typeof vi.fn>;
}): RetrieveDeps & { query: ReturnType<typeof vi.fn> } {
  const query =
    overrides.query ??
    vi.fn().mockResolvedValue({ points: overrides.points ?? [{ id: "chunk-1", score: 0.9 }] });

  return {
    qdrant: { query } as unknown as QdrantClient,
    embedding: { baseUrl: "http://stub", model: "stub" },
    loadChunks: async () => overrides.loaded ?? [chunk()],
    query,
  };
}

// The embedding call is the only network dependency in the path; stubbing fetch
// keeps the test to the logic it is actually about.
function stubEmbedding() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
    }),
  );
}

describe("retrieve", () => {
  it("filters every search by the requested collection", async () => {
    stubEmbedding();
    const d = deps({});

    await retrieve({ collectionId: "clinical", question: "consent?", topK: 5 }, d);

    expect(d.query).toHaveBeenCalledTimes(1);
    const [, args] = d.query.mock.calls[0];
    expect(args.filter).toEqual({
      must: [{ key: "collectionId", match: { value: "clinical" } }],
    });
  });

  it("refuses to run unscoped", async () => {
    stubEmbedding();
    await expect(
      retrieve({ collectionId: "", question: "anything", topK: 5 }, deps({})),
    ).rejects.toThrow(/requires a collectionId/);
  });

  // If the filter is ever wrong, the right outcome is a loud failure. A leaked
  // chunk becomes a confident answer citing a department the caller cannot read,
  // which is the worst possible way for this to degrade.
  it("throws rather than returning a chunk from another collection", async () => {
    stubEmbedding();
    const d = deps({ loaded: [chunk({ collectionId: "manufacturing" })] });

    await expect(
      retrieve({ collectionId: "clinical", question: "validation?", topK: 5 }, d),
    ).rejects.toThrow(/Isolation violation/);
  });

  // A vector with no row means the two stores drifted — most likely a delete that
  // half-completed. Surfacing it would cite a document that no longer exists.
  it("drops hits whose chunk row is missing rather than citing a ghost", async () => {
    stubEmbedding();
    const d = deps({
      points: [
        { id: "chunk-1", score: 0.9 },
        { id: "orphaned", score: 0.8 },
      ],
      loaded: [chunk()],
    });

    const result = await retrieve({ collectionId: "clinical", question: "q", topK: 5 }, d);

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].chunkId).toBe("chunk-1");
  });

  it("preserves Qdrant rank order and carries scores through", async () => {
    stubEmbedding();
    const d = deps({
      points: [
        { id: "chunk-2", score: 0.91 },
        { id: "chunk-1", score: 0.44 },
      ],
      loaded: [chunk(), chunk({ id: "chunk-2" })],
    });

    const result = await retrieve({ collectionId: "clinical", question: "q", topK: 5 }, d);

    expect(result.chunks.map((c) => c.chunkId)).toEqual(["chunk-2", "chunk-1"]);
    expect(result.chunks[0].score).toBeCloseTo(0.91);
  });
});
