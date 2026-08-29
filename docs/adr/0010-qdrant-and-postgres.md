# 0010. Qdrant for vectors, Postgres for everything else

**Status:** Accepted
**Date:** 2026-08-29
**Supersedes:** [ADR-0008](0008-chromadb-and-postgres.md)

## Context

ADR-0008 chose Chroma on the grounds that it is simple and that its native *collection* concept
maps one-to-one onto the product collection from ADR-0002. Re-examined before writing any code,
both grounds are weaker than they looked, and one of them is actively wrong.

The brief asks for "choices considered and final choice" on the vector database. "It was the
simplest" is a thin answer to that question. The switching cost right now is zero — no code
exists — and in a week it won't be. That asymmetry is most of the argument.

## What changed my mind

**The collection mapping is a liability, not a feature.** Chroma collections are physical
partitions. Collection-per-department means many small indexes, degraded recall characteristics
on the small ones, and N queries for anything spanning collections. The standard Qdrant pattern —
one collection, a payload filter per tenant — is a single query, scales properly, and is the
multi-tenancy shape I'd actually defend in the productionisation section. I had the abstraction
backwards: the product concept should be a *filter*, not a partition.

**Hybrid retrieval stops being aspirational.** Tier 2 of `docs/scope.md` wants hybrid retrieval
with before/after eval numbers. Qdrant has native sparse-vector support and a fusion query API,
so that's configuration. On Chroma it's hand-rolled BM25 plus my own fusion — enough work that
it would realistically get cut. This is the difference between shipping the differentiator and
writing it up as future work.

**Filtering is on the hot path of every single query.** Collection scoping (ADR-0002) means
*every* retrieval carries a filter. Qdrant applies filters during HNSW graph traversal rather
than over-fetching and post-filtering. That's a specific, defensible technical reason tied
directly to my own design, which is exactly the kind of reasoning the brief is asking for.

## Decision

**Qdrant** for vectors and chunk payloads — one collection, `collection_id` in the payload,
filtered on every query. **Postgres** for collections, documents, ingestion status, query traces
and eval runs.

## Consequences

- Qdrant is a Rust single binary, so the Python container leaves the stack entirely. Compose is
  `web`, `postgres`, `qdrant`, and "TypeScript throughout" becomes literally true rather than
  approximately true.
- Qdrant Cloud gives the AWS/productionisation section a credible managed answer. Chroma's was
  thinner.
- Cross-store deletion (open question 11) gets easier: delete-by-filter removes every chunk for a
  document in one call. Still two stores with no spanning transaction, so the ordering and the
  partial-failure path still need deciding and testing — the problem shrank, it didn't vanish.
- Slightly more to learn: points, payloads, named vectors. Accepted; it's an afternoon, and the
  concepts are the ones worth being able to talk about in the follow-up interview.
- Isolation is now enforced by a filter I construct rather than by physical separation. That
  makes the Tier 1 isolation test *more* important, not less — a missing filter is a silent leak
  rather than an impossible query. Worth making that argument explicitly in the README rather
  than hoping nobody asks.
