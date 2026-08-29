# 0004. Embeddings run locally, always

**Status:** Accepted
**Date:** 2026-08-29

## Context

ADR-0003 makes the *generation* model pluggable because local generation is slow on CPU and
noticeably lower quality. Embeddings are a different problem with different economics.

## Decision

Embeddings always run locally. No hosted embedding adapter, no environment variable, no branch.

## Rationale

- Embedding models are small and CPU-fast. `nomic-embed-text` or `bge-small` class models
  embed a document corpus in seconds without a GPU. The constraint that forced ADR-0003's
  complexity doesn't exist here.
- Ingestion is where the *whole document* gets sent somewhere. Keeping embeddings local means
  that even in hosted-LLM mode, only the retrieved chunks for a single query ever leave the
  machine — never the corpus. That's a much stronger and more precise privacy claim than
  "we support local models", and it's the one that matters to a regulated client.
- Making it pluggable would be a real cost, not a free one: swapping embedding models invalidates
  the entire index, so the "choice" is a re-ingest, not a runtime toggle. Better to make it a
  deliberate single decision than to pretend it's configurable.

## Consequences

- One less adapter and one less failure mode.
- The privacy claim in the README gets sharper and stays true in both LLM modes.
- Embedding model choice becomes a real decision to defend rather than a config option — needs
  a line in the README on why this model, and ideally a dimension/quality note.
- Changing the embedding model later means reindexing everything. Accept it; note it in the
  productionisation section, since it's a real operational concern at scale.
