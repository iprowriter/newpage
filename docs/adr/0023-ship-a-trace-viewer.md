# 0023. Ship a trace viewer, so the OpenTelemetry claim is checkable

**Status:** Accepted
**Date:** 2026-08-29
**Revises:** [ADR-0016](0016-own-the-trace-store.md)

## Context

ADR-0016 built an in-app trace page backed by Postgres and emitted OpenTelemetry
spans alongside it, with no exporter and no collector. The reasoning for the second
half was that shipping to Langfuse or Datadog should be a configuration change
rather than an instrumentation project.

That reasoning was fine. The **presentation** of it was not: with nothing to send
spans to, a reviewer could read that the system emits OpenTelemetry and had no way
to confirm it. The brief asks for observability, and an unverifiable claim about
observability is the one kind that should not be taken on trust.

## What I got wrong the first time

ADR-0016 rejected Jaeger on the grounds that it is generic — it shows spans and
latency, not prompts, retrieved chunks or grade decisions. That is true, and it
was the right answer to the question being asked at the time: *should Jaeger be
the observability story?* No.

It is the wrong answer to the question that actually mattered: *should there be
somewhere for the spans to go?* Judged as a complement rather than a replacement,
it is one container with in-memory storage, and it converts an assertion into a
waterfall a reviewer can click.

The Langfuse rejection in ADR-0016 stands unchanged — that was about four or five
containers, not one.

## Decision

Add Jaeger to Compose and point the exporter at it by default.

- `OTEL_EXPORTER_OTLP_ENDPOINT` defaults to the bundled Jaeger; override it and
  spans go anywhere else instead. The integration effort for a vendor is that
  one variable, which is now demonstrable rather than promised.
- The `/traces` page links to it, because a viewer a reviewer never finds is the
  same as no viewer.
- OTLP is published on the host as well as the container network, so
  `npm run dev` reaches the same viewer.

**Two views, deliberately, and they answer different questions.** `/traces` is
this system's own story — retrieved chunks with scores, the grade decision, the
refusal reason, human feedback. Jaeger is the standard shape: nesting, timing,
`gen_ai.*` attributes, and the downstream HTTP calls to Qdrant, Ollama and Gemini
underneath each stage. Neither subsumes the other, and shipping only the second
would have lost the domain detail that makes the first worth reading.

## Consequences

- Compose goes from six services to seven. Accepted: it is one small image, and
  it buys the difference between a claim and evidence.
- Verified end to end — a single query produces 13 spans, including
  `rag.grade.decision=generate`, `rag.retrieval.top_score=0.774`, and
  `gen_ai.usage.input_tokens=1355`.
- Jaeger stores in memory, so traces do not survive a restart. Correct for a
  demo, wrong for production, and the productionisation section says so.
- The healthcheck cost a debugging cycle: Jaeger v2 does not ship the v1
  `all-in-one-linux` binary, so the obvious probe fails forever while the service
  is healthy. Same failure shape as the Qdrant `/dev/tcp` probe — a healthcheck
  that cannot pass turns `depends_on` into a hang, and that is a cold-start
  failure, not a monitoring nicety.
