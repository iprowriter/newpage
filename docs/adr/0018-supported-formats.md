# 0018. Supported formats: PDF and plain text/Markdown only

**Status:** Accepted
**Date:** 2026-08-29

## Context

Open question 10 — the unresolved cost of staying on TypeScript (ADR-0011). Node's document
parsing ecosystem is weaker than Python's, and ADR-0012 makes chunk quality depend directly on
parse quality, so this decides more than it appears to.

## Decision

**PDF** via `pdfjs-dist`, and **plain text / Markdown**. Nothing else.

`.docx`, `.pptx`, `.html`, scanned/OCR PDFs and spreadsheets are explicitly out of scope and
listed as such in the README. The brief permits acknowledged edge cases; it does not reward
half-supporting five formats.

## Why pdfjs-dist

`getTextContent()` returns per-item transform matrices, so extraction yields character offsets
and positions — the metadata ADR-0012 stores for citations.

The decisive reason is coordinate consistency: the document viewer will be pdfjs (via react-pdf)
regardless, because that is what renders PDFs in a browser. Extracting with one library and
rendering with another means reconciling two coordinate systems for the one feature where
coordinates *are* the feature. Same library both sides, one coordinate space. This is the
argument that also settled ADR-0011.

## Known limitations, to be stated rather than hidden

- **Multi-column layouts** may interleave incorrectly. pdfjs returns text items in document order,
  not reading order.
- **Tables** flatten to sequences of cell text and lose their row/column relationships. Real, and
  ADR-0017 deliberately includes a couple of table-heavy documents so this is demonstrated
  honestly rather than claimed away.
- **Scanned PDFs** produce nothing. No OCR. Detect zero extracted text and fail with a clear
  message rather than silently ingesting an empty document — a silent empty ingest is far worse
  than a rejection.
- **Headers, footers and page numbers** repeat into chunks unless stripped. Cheap heuristic
  (text repeating at the same position across pages), worth doing because it pollutes embeddings.

## Consequences

- ADR-0017's corpus is entirely PDF and well-structured, so the supported set covers the demo
  fully. Markdown support exists because it makes writing test fixtures trivial, not for users.
- Layout-heavy documents degrade to paragraph packing rather than failing. Acceptable floor,
  documented.
- If table fidelity ever mattered, the answer is a layout-aware parser and probably a Python
  sidecar — a reasonable thing to name in the productionisation section, and a reasonable thing
  not to build now.
