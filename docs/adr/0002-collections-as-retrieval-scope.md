# 0002. Collections are the retrieval scoping primitive

**Status:** Accepted
**Date:** 2026-08-29

## Context

A bare "upload a PDF and chat with it" app is the default shape of this assignment and has
almost no engineering surface. It also doesn't resemble how documents are actually used inside a
company, where they belong to a team and shouldn't leak across teams.

Newpage sells into pharma and regulated enterprise. Document isolation between departments is a
problem their clients actually have.

## Options considered

**Single document per session.** Simplest, no metadata design, no isolation story. Too thin.

**One flat corpus, everything searchable.** Slightly more interesting retrieval, but no isolation
and no realistic access model.

**Named collections with scoped retrieval.** Documents accumulate into a named collection
(Engineering, Marketing, Legal); every query filters by collection. Single-document chat becomes
the degenerate case of a collection with one document, so I get both shapes from one abstraction.

## Decision

Collections. Every chunk carries a collection id; every retrieval filters on it.

**Collections must be a real retrieval boundary, not a system-prompt skin.** If "department"
reduces to a different persona string in the prompt, it's cosmetic and adds nothing. The scoping
happens in the query, and a collection may carry its own retrieval config — chunk size, top-k —
because a legal contract and an engineering RFC don't want the same chunking.

## Consequences

- Forces metadata filtering into the vector store choice (open question 2).
- Gives a real thing to test: a query scoped to Marketing must never retrieve an Engineering
  chunk. That's the isolation test in `docs/scope.md` Tier 1.
- Sets up the multi-tenancy discussion in the productionisation section of the README for free.
- Adds UI surface — collection creation, switching, per-collection document lists. Accepted cost;
  it's what turns a chat box into a product.
- Not doing auth. Collections demonstrate the isolation shape without a user system; real
  tenancy goes in "what I'd add next".
