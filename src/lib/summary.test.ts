import { describe, expect, it } from "vitest";

import { summaryFingerprint } from "./summary";

/**
 * The fingerprint is what decides whether a stored summary is still shown, so
 * these are the two properties that decision rests on. Both were previously only
 * provable by reading the hash call.
 */
describe("summaryFingerprint", () => {
  it("does not depend on the order the document ids arrive in", () => {
    // Two routes read these rows with different `orderBy` clauses. If order
    // mattered, a current summary would read as stale on one of them.
    expect(summaryFingerprint(["a", "b", "c"])).toBe(summaryFingerprint(["c", "a", "b"]));
  });

  it("changes when one document is swapped for another", () => {
    // The case a count would miss, and the case where the old summary is most
    // wrong: same number of documents, different documents.
    expect(summaryFingerprint(["a", "b"])).not.toBe(summaryFingerprint(["a", "c"]));
  });

  it("distinguishes an empty set from a single document", () => {
    expect(summaryFingerprint([])).not.toBe(summaryFingerprint(["a"]));
  });
});
