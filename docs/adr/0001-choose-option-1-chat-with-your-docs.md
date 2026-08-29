# 0001. Build Option 1, Chat With Your Docs

**Status:** Accepted
**Date:** 2026-08-29

## Context

The assignment offers four options: chat with docs, code documentation assistant, meeting
intelligence, career intelligence. The grading criteria name chunking, embedding model
selection, retrieval approach, prompt engineering, context management, guardrails, quality
controls and observability. That's a RAG rubric, not a product rubric.

## Options considered

**Option 4 — Career Intelligence.** Tempting: I have real domain depth here and existing work
(a cover letter generator, a job-search playbook), so I could judge answer quality instantly and
write the README in a genuinely personal voice. Killed by one problem — a resume is two pages
and a job description is one. The entire corpus fits in a single context window, which makes the
retrieval layer decorative. I'd be graded on RAG decisions I didn't actually have to make. It's
possible to force it (20+ postings, cross-document requirement matching) but that's inventing a
retrieval problem to justify the tooling.

**Option 2 — Code documentation assistant.** Highest ceiling and highest risk. Good code
chunking is AST-aware and genuinely hard, and failures are obvious to engineer reviewers reading
answers about code they know.

**Option 3 — Meeting intelligence.** Nice metadata for citations (speakers, timestamps), but I'd
be synthesising the transcripts myself, so the demo rests on a corpus I invented.

**Option 1 — Chat with your docs.** The only option where retrieval is load-bearing rather than
decorative. Real documents, real chunking decisions, real retrieval quality problems.

## Decision

Option 1. Ingest a document collection, answer questions over it with citations.

## Consequences

- Every graded RAG decision is forced by the problem rather than invented to satisfy a rubric.
- **This is the option most candidates will pick.** No differentiation from the idea itself, so
  the separation has to come from execution: exact-span citations, visible refusal, an eval
  harness with real numbers, and traces I can screenshot. Recorded in `docs/scope.md`.
- I lose the "I'm the domain expert and can instantly grade the answers" advantage that Option 4
  had. Mitigation: choose the demo corpus deliberately and write the eval set by hand
  (open question 8).
