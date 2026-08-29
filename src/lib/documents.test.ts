import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { QdrantClient } from "@qdrant/js-client-rest";

import { deleteDocument } from "./documents";

/**
 * The deletion-ordering test (specs.md §11).
 *
 * Order is asserted by recording the sequence of calls rather than by reading
 * the code, because the failure this guards against is a later edit that looks
 * harmless — moving the Postgres delete above the Qdrant one changes nothing
 * visible until a vector store outage, at which point retrieval starts citing
 * documents that no longer exist.
 */

function harness({ qdrantFails = false } = {}) {
  const calls: string[] = [];

  const qdrant = {
    delete: vi.fn(async () => {
      calls.push("qdrant.delete");
      if (qdrantFails) throw new Error("qdrant unreachable");
    }),
  } as unknown as QdrantClient;

  const db = {
    document: {
      findUnique: vi.fn(async () => ({ id: "doc-1", status: "ready" })),
      update: vi.fn(async () => {
        calls.push("postgres.update");
        return {};
      }),
      delete: vi.fn(async () => {
        calls.push("postgres.delete");
        return {};
      }),
    },
  } as unknown as PrismaClient;

  return { db, qdrant, calls };
}

describe("deleteDocument", () => {
  it("removes vectors before rows", async () => {
    const { db, qdrant, calls } = harness();

    await expect(deleteDocument("doc-1", { db, qdrant })).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["qdrant.delete", "postgres.delete"]);
  });

  // The point of the ordering: a vector-store failure must leave rows that
  // nothing can retrieve, never vectors whose text has been deleted.
  it("leaves the row intact and marks it when the vector delete fails", async () => {
    const { db, qdrant, calls } = harness({ qdrantFails: true });

    const result = await deleteDocument("doc-1", { db, qdrant });

    expect(result).toMatchObject({ ok: false, reason: "vectors_failed" });
    expect(calls).toEqual(["qdrant.delete", "postgres.update"]);
    expect(calls).not.toContain("postgres.delete");
  });

  it("reports a missing document without touching either store", async () => {
    const { db, qdrant, calls } = harness();
    (db.document.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(deleteDocument("nope", { db, qdrant })).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(calls).toEqual([]);
  });
});
