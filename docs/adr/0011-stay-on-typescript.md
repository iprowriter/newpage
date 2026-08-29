# 0011. Reconsidered Python, staying on TypeScript

**Status:** Accepted
**Date:** 2026-08-29
**Confirms:** [ADR-0007](0007-fullstack-nextjs.md)

## Context

Python is the default language for RAG work, and it was worth asking directly whether the whole
retrieval layer belonged there instead. Recorded because the brief asks for choices considered,
and because "we used TypeScript" is not an answer without the alternative attached.

## What Python would actually have won

**PDF parsing.** PyMuPDF is meaningfully better than anything in Node — layout-aware extraction,
reading order, per-block bounding boxes. `unstructured` and `docling` for messy documents. This
is a real gap and the only one that survived scrutiny.

**Evals.** ragas, deepeval. Weak in practice: ADR-pending open question 6 already leans
hand-built so I can explain every number, and promptfoo runs fine in TypeScript.

**Ecosystem familiarity.** Mild signal value with an AI-services reviewer. The brief explicitly
says stack choice isn't graded.

## The argument that nearly worked, and why it didn't

The strongest case for Python was citation-to-highlighted-span in a document viewer — the most
visually compelling feature in Tier 2, and much easier with PyMuPDF's bounding boxes.

It inverts on inspection. The viewer will be pdfjs (via react-pdf) regardless, because that's
what renders PDFs in a browser, and pdfjs's `getTextContent()` already exposes per-item transform
matrices. Extracting with PyMuPDF and rendering with pdfjs means reconciling two coordinate
systems for the one feature where coordinates *are* the feature. Doing both with pdfjs is simpler
and less error-prone. TypeScript wins the argument that was supposed to sink it.

## Decision

Stay on TypeScript. Full-stack Next.js per ADR-0007.

## Consequences

- Reverting to Python would reintroduce the service boundary ADR-0007 deliberately removed, and
  worse than before, since types couldn't be shared across it at all.
- The PDF parsing gap is real and unresolved. It gets managed by scoping supported formats
  narrowly (open question 10) and stating the limitation, which the brief explicitly permits,
  rather than by changing language.
- Time is the binding constraint. Everything on the rubric — evals, citations, observability,
  tests, the README — competes for it, and working in a language I'm slower in taxes all of them.
- With Qdrant replacing Chroma (ADR-0010) there is no Python in the stack at all.
