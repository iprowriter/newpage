# 0014. Pin exact model IDs; never a floating alias

**Status:** Accepted
**Date:** 2026-08-29
**Refines:** [ADR-0003](0003-pluggable-llm-provider.md), [ADR-0009](0009-hosted-default-and-api-key-handling.md)

## Context

Open question 5. The intent was "Gemini latest, swappable with Ollama". The swappability is
settled; "latest" is the problem.

## The problem with "latest"

The submission rests on a table of eval numbers (ADR-0003: local vs hosted; ADR-0012: chunk size
comparison). A number produced against a floating alias is not reproducible — the model rotates
underneath it and the claim silently stops being true. A reviewer who reruns the eval and gets
different numbers has found an inconsistency I can't explain, and the table was supposed to be
the strongest part of the submission.

This is a general engineering standard, not an LLM quirk: benchmark results cite versions.

## Decision

Pin exact model IDs in configuration. No `-latest`, no unversioned aliases.

**Every eval run row records the model ID alongside the chunk config and retrieval config**, so
any number in the README can be traced to the exact setup that produced it.

Choices:

- **Hosted generation:** a Flash-tier Gemini — cheap, fast, and grounded extraction from supplied
  context is what that tier is good at. Exact ID confirmed and pinned at build time.
- **Local generation:** a 3B-class instruct model, small enough to stay responsive on CPU per
  ADR-0009. Expected to be worse at refusal discipline and citation fidelity — that expectation
  *is* the comparison column, not a disappointment.
- **Embedding:** `nomic-embed-text` or a `bge-small`-class model via Ollama (ADR-0004). Pinned
  hardest of the three.

## Consequences

- The embedding model is effectively immutable after first ingest: its dimension is fixed in the
  Qdrant collection at creation, so changing it means dropping and reindexing. Treat it as a
  schema decision, not a config value, and say so in the README.
- Pinned IDs go stale. Acceptable for a submission; in production this is a dependency to review
  deliberately, which is the correct thing to say in the productionisation section.
- Slightly worse first-run experience if a pinned hosted ID is retired before the reviewer runs
  it. Mitigation: fail with a clear error naming the model rather than a generic API error.
