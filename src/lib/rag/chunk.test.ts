import { describe, expect, it } from "vitest";

import { chunkDocument } from "./chunk";
import { extractText } from "./extract-text";
import type { ChunkOptions } from "./types";

const options = (overrides: Partial<ChunkOptions> = {}): ChunkOptions => ({
  chunkTokens: 60,
  overlapSentences: 1,
  docTitle: "Guidance for Industry",
  ...overrides,
});

const doc = (markdown: string) => extractText(markdown, true);

describe("chunkDocument", () => {
  // Property 1 of ADR-0012. If this breaks, retrieval starts returning chunks
  // that straddle two topics and the failure looks like "the model is bad".
  it("never merges content from two sections into one chunk", () => {
    const source = doc(`# Scope

This guidance describes the agency position on scope.

# Definitions

An adverse event means any untoward medical occurrence.`);

    const chunks = chunkDocument(source, options());

    expect(chunks).toHaveLength(2);
    expect(chunks[0].displayText).toContain("agency position on scope");
    expect(chunks[0].displayText).not.toContain("adverse event");
    expect(chunks[1].displayText).toContain("untoward medical occurrence");
  });

  it("tracks the heading stack so nested sections carry their full path", () => {
    const source = doc(`# Clinical Trials

## Informed Consent

### Documentation

Consent must be documented in writing before enrollment begins.`);

    const [chunk] = chunkDocument(source, options());

    expect(chunk.headingPath).toEqual([
      "Clinical Trials",
      "Informed Consent",
      "Documentation",
    ]);
  });

  it("pops the heading stack when a sibling section starts", () => {
    const source = doc(`# One

## Alpha

Text about alpha appears in this paragraph.

## Beta

Text about beta appears in this paragraph.`);

    const chunks = chunkDocument(source, options());

    expect(chunks[0].headingPath).toEqual(["One", "Alpha"]);
    expect(chunks[1].headingPath).toEqual(["One", "Beta"]);
  });

  // Property 2 of ADR-0012, and specs.md §11's "two representations" test. The
  // breadcrumb improves retrieval; leaking it into displayText would put text in
  // a citation that the source document does not contain.
  it("puts the breadcrumb in embedText and keeps it out of displayText", () => {
    const source = doc(`# Scope

## Applicability

This guidance applies to sponsors of clinical investigations.`);

    const [chunk] = chunkDocument(source, options());

    expect(chunk.embedText).toContain("Guidance for Industry > Scope > Applicability");
    expect(chunk.embedText).toContain("applies to sponsors");

    expect(chunk.displayText).not.toContain("Guidance for Industry >");
    expect(chunk.displayText).toContain("applies to sponsors");
  });

  // The property that makes citation highlighting possible later. Reassembling
  // text from block strings would pass every other test here and still drift.
  it("emits offsets that slice the exact displayText back out of the source", () => {
    const source = doc(`# Records

Records shall be retained for two years after the investigation ends.

Copies must be available for inspection at any reasonable time.`);

    for (const chunk of chunkDocument(source, options())) {
      expect(source.text.slice(chunk.charStart, chunk.charEnd).trim()).toBe(
        chunk.displayText,
      );
    }
  });

  it("splits a long section on the token budget rather than emitting one huge chunk", () => {
    const paragraph = "The sponsor shall maintain adequate records of the investigation. ".repeat(4);
    const source = doc(`# Recordkeeping

${paragraph}

${paragraph}

${paragraph}`);

    const chunks = chunkDocument(source, options({ chunkTokens: 60, overlapSentences: 0 }));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // The budget is a target, not a hard ceiling: a chunk is allowed to
      // overshoot by at most the block that tipped it over.
      expect(chunk.tokenCount).toBeLessThanOrEqual(60 * 2);
    }
  });

  it("carries overlap within a section", () => {
    const source = doc(`# Retention

First sentence establishes the retention period clearly. Second sentence adds a qualifying condition to it.

Third sentence introduces an exception for terminated studies.`);

    const chunks = chunkDocument(source, options({ chunkTokens: 30, overlapSentences: 1 }));

    expect(chunks.length).toBeGreaterThan(1);
    const tail = chunks[0].displayText.trim().slice(-40);
    expect(chunks[1].displayText).toContain(tail.trim());
  });

  // Overlap across a heading would blur the very boundary the section rule
  // exists to protect.
  it("does not carry overlap across a heading boundary", () => {
    const source = doc(`# Alpha

Alpha section content sits here and says something specific.

# Beta

Beta section content sits here and says something different.`);

    const chunks = chunkDocument(source, options());

    expect(chunks[1].displayText).not.toContain("Alpha section content");
  });

  it("does not emit a chunk for a heading with no body", () => {
    const source = doc(`# Empty Section

# Real Section

This section actually contains prose worth retrieving.`);

    const chunks = chunkDocument(source, options());

    expect(chunks).toHaveLength(1);
    expect(chunks[0].headingPath).toEqual(["Real Section"]);
  });
});
