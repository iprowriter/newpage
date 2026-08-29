# 0019. UI shape: one page type, grounded suggestions, refusal as a designed surface

**Status:** Accepted
**Date:** 2026-08-29

## Context

The UI is graded — "creativity in UI/UX design and product innovation. We expect a well designed
application." It's also how the reviewer experiences everything else: a reviewer with fifteen
minutes judges time-to-first-answer, not architecture.

## Decision

### One page type, not two

The landing experience is upload-and-ask with no setup. But it is **a seeded collection named
Quick start**, listed in the sidebar like any other — not an ephemeral special case.

An ephemeral "any document" mode would mean two data models, two code paths, and an exception to
the isolation invariant (`specs.md` §7.3). One collection type keeps the invariant absolute and
deletes a branch from every layer beneath it.

### Suggested questions are generated from the document, not the topic

Three starter questions after ingest, generated from the document's **own heading tree and
chunks** (ADR-0012 already extracts it) — never from the model's general knowledge of the subject.

- They're grounded by construction, so they can't suggest something the corpus can't answer.
- They double as evidence the chunking worked, which is a feature that pays for itself twice.
- **Generated once at ingest and stored.** They don't change, and a per-page-load LLM call is a
  visible stall on the Ollama path.

### Follow-ups come from retrieved chunks, in the same call

Two follow-up questions after each answer, derived from the **retrieved chunks and their
neighbours** — not from the answer text. Follow-ups generated from an answer drift toward things
the corpus doesn't cover, so the demo produces refusals and the reviewer reads correct behaviour
as a broken system. Sourcing from retrieved context makes every suggestion answerable by
construction.

Requested as structured output **in the same generation call** as the answer. A second round-trip
roughly doubles perceived latency for no benefit, and that matters most where it hurts most.

### The provider toggle demonstrates rather than configures

Local/hosted is switchable in the UI, and **every answer is stamped with the model that produced
it and its latency**. Flipping to Ollama and watching quality drop is ADR-0003's argument
happening in front of the reviewer instead of being claimed in a README. Switching warns that
local is slower, so slowness reads as expected rather than broken.

### Refusal is a designed surface, not an error state

The most load-bearing behaviour in the system (ADR-0001, ADR-0015, ADR-0017) gets deliberate
design, not a grey "I don't know" bubble. A refusal shows: what was searched, what came back and
at what scores, why it fell below threshold, whether the rewrite-retry fired, and what to try
instead.

This is the screenshot that separates the submission — it demonstrates the system knows the
difference between *absent* and *unknown*.

### Provenance at two depths

- Inline under every answer: an expandable "how did I get this" — retrieved chunks, scores, model,
  latency. No navigation, always one click away.
- `/traces` for the full history (`specs.md` §9).

### Document list carries state, not just dates

Filename, date added, ingest status (`pending / processing / ready / failed`) and chunk count.
`specs.md` §5 makes zero-extracted-text a hard failure, so the UI must have somewhere to show it —
a visible failure demonstrates handled failure; a silent one looks like a bug.

Delete asks for confirmation. Not security (ADR-0020) — just not destroying a reviewer's ingest
on a stray click.

## Consequences

- Collections sidebar, chat, and traces are the whole surface. Small enough to build well, which
  is the trade the brief asks for.
- Starter-question generation adds an ingest step that can fail; it must degrade to no
  suggestions rather than failing the ingest.
- Structured output for answer-plus-follow-ups constrains the generation prompt and needs a
  schema-validation failure path — if parsing fails, show the answer and drop the follow-ups.
- The refusal surface needs the grade decision plumbed through to the UI, not just logged. Worth
  it; it's the differentiator.
