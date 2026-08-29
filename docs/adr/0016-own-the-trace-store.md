# 0016. Own the trace store; in-app trace viewer, OpenTelemetry as the production seam

**Status:** Accepted
**Date:** 2026-08-29

## Context

Open question 7, with an extra requirement: the reviewer should be able to *see* the traces, not
just read about them. Observability that requires an account, a cloud project or a screenshot I
took myself is much weaker evidence than observability they can click through on their own run.

## Options considered

**Langfuse, self-hosted.** The obvious pick — LLM-native, understands prompts, tokens, retrieval
spans, and has a datasets feature that would house eval runs. Rejected on weight: current
self-host needs Postgres plus ClickHouse plus Redis plus object storage, taking compose from 3
services to roughly 8. The first-run experience is the thing I can least afford to make slow and
fragile (open question 12), and this would quadruple the surface for a reviewer's cold start.

**Langfuse Cloud or LangSmith.** No container weight, but reviewer access means either sharing my
project or shipping a key — and ADR-0009 already ruled out shipping keys. Falls back to
screenshots, which is exactly the weaker evidence I'm trying to avoid.

**OTel plus Jaeger in compose.** Self-hosted and standard, but generic: it shows spans and
latency, not prompts, retrieved chunks or scores. Wrong vocabulary for the thing being observed.

**Own the trace store.** Postgres already holds query traces and eval runs (ADR-0010). Render
them in the app.

## Decision

**Own it, render it in-app, and emit OpenTelemetry alongside.**

- Traces persist to Postgres — no new infrastructure, because this was already the design.
- A `/traces` page in the Next.js app. Reviewer access is free: it's part of the application
  they're already running. No accounts, no extra containers, and it's screenshot-ready for the
  submission.
- Each trace records: the query, the collection filter applied, retrieved chunk IDs with scores,
  the grade decision from the LangGraph guardrail (ADR-0013), whether a rewrite-retry fired,
  per-stage latency, token counts, the pinned model ID (ADR-0014), and the refusal decision with
  its reason.
- **Emit OpenTelemetry spans in parallel.** Locally they render in my own page; the
  productionisation section then says "this already emits OTel, so it ships to Langfuse or
  Datadog with no code change."

## Consequences

- The thing I deliberately *didn't* build becomes evidence of judgment rather than a gap: "I'd
  run Langfuse in production, here's why self-hosting it in a take-home would have been the wrong
  trade, and here's the instrumentation seam that makes adopting it a config change."
- Owning the schema means showing exactly what matters for *this* system rather than what a
  generic tool happens to surface — particularly the guardrail decision, which is the behaviour
  this submission most wants to evidence.
- Cost: a page to build and maintain, and it will be less capable than Langfuse. Correct trade at
  this size; it stops being correct the moment trace volume outgrows Postgres, which belongs in
  the productionisation section.
- The trace viewer and the eval runs share a store, so the observability page and the quality
  numbers can be looked at together. That link is worth making explicit in the UI.
- Storing full queries and retrieved chunks is a data-retention question in any real deployment.
  Note it in productionisation rather than pretending a demo settles it.
