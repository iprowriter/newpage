# 0020. No auth; in production the collection scope comes from the session

**Status:** Accepted
**Date:** 2026-08-29

## Context

Should adding and removing documents be gated by authentication and authorisation? It's a fair
question for a system whose organising concept is departmental isolation, and for an audience
selling into regulated industries.

## Decision

**Don't build it.** Already out of scope in `specs.md` §2, and it competes for time with evals,
citations and observability, which are what's graded. Collections already demonstrate the
isolation *shape*, which is the interesting half of the problem.

**But don't be silent about it either.** The README states the production design explicitly:

> Today `collectionId` arrives in the request body. That is correct for a demo and wrong for
> production. Under ADR-0010 isolation is a payload filter rather than a physical partition, so a
> client that can name a collection can read it. In production the set of collections a caller may
> query is derived from the authenticated session and the filter is constructed server-side from
> that — never from client input. The single retrieval entry point (`specs.md` §7.3) is the place
> that changes, and it is one function.

## Why this beats building a login form

A half-built auth system on a take-home demonstrates that I can wire up a session library. The
paragraph above demonstrates that I understand the threat model *of my own design* — that
choosing filter-based isolation (ADR-0010) moved the security boundary from the database into my
code, and that I know exactly which function now carries it.

It also makes the case for the architecture: because retrieval has a single enforced entry point,
adding real tenancy is a small, locatable change rather than an audit of every call site.

## Consequences

- The demo is open by design. Say so plainly rather than letting a reviewer wonder if it was
  overlooked.
- Multi-tenancy, rate limiting and audit logging go in the productionisation section together —
  they're the same conversation.
- Delete confirmation still exists (ADR-0019), for accident prevention rather than authorisation.
