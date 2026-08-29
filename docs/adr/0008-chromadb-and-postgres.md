# 0008. ChromaDB for vectors, Postgres for everything else

**Status:** Superseded by [ADR-0010](0010-qdrant-and-postgres.md)
**Date:** 2026-08-29

> **Superseded 2026-08-29.** The decision rested on Chroma being simple and its collection
> concept mapping onto the product concept. On re-examination the mapping is a liability rather
> than a feature, and "it was simple" is a weak answer to a question the brief asks explicitly.
> See ADR-0010. Kept because the two-store consequences below still apply.

## Context

Open question 2. Needs to run in compose with no cloud account, support metadata filtering for
collection scoping (ADR-0002), and have a defensible answer to "how would this scale on AWS".

## Options considered

**pgvector.** One store instead of two. Collection metadata and vectors in the same database
means deletes are transactional and there's no sync problem. Obvious managed path (RDS/Aurora).
Weakness: choosing the database I already need can read as a default rather than a decision.

**Qdrant.** Purpose-built, strong filtering, good Node client. One more container, and a second
store to keep in sync.

**ChromaDB.** Purpose-built, minimal setup, and its native *collection* concept maps one-to-one
onto the product concept in ADR-0002 — the abstraction I designed and the abstraction the store
provides are the same thing, which keeps the retrieval code honest and small.

## Decision

**Chroma** for vectors and chunk-level metadata. **Postgres** for everything else — collections,
documents, ingestion status, query traces, eval runs.

## Consequences

- The Chroma collection ↔ product collection mapping means scoped retrieval is a native operation
  rather than a filter I hand-roll. Less code in the hot path.
- **Two stores means a consistency burden, and it needs handling explicitly.** A document is rows
  in Postgres and chunks in Chroma. Deleting a document must remove both, and there's no
  transaction spanning them. At this scale the answer is a deliberate ordering plus a reconciliation
  path, not distributed transactions — but it has to be written down and tested rather than
  discovered by a reviewer. Likely probe question in the follow-up interview.
- **Chroma's server is Python.** The JS client is an HTTP client against it. So the stack has a
  Python container regardless of ADR-0007 — irrelevant operationally, but worth not being
  surprised by, and worth stating accurately in the README rather than calling this a pure
  TypeScript stack.
- **Scale answer needs to be real.** Chroma's managed story is thinner than pgvector-on-RDS or
  Qdrant Cloud. The honest productionisation answer: Chroma is right at demo scale, and past some
  corpus size I'd migrate to pgvector or a managed vector service. Saying that is stronger than
  pretending Chroma scales to anything.
- Postgres earns its place independently: query traces and eval runs are relational data I want
  to query for the observability section, not documents to embed.
