# 0007. Full-stack Next.js, single application

**Status:** Accepted
**Date:** 2026-08-29
**Supersedes:** [ADR-0006](0006-typescript-node-backend-nextjs-frontend.md)

## Context

ADR-0006 split the app into a Next.js frontend and a separate Node API service. Revisiting it:
that's two Dockerfiles, a CORS boundary and a shared-types burden for an application whose entire
job is ingest → embed → retrieve → answer.

The brief is unusually direct here: *"we value a solid & well-engineered basic solution A LOT MORE
than an over-engineered complex one."* A service boundary that exists to look like architecture,
rather than because something needed to scale or deploy separately, is the failure mode they're
warning about.

## The two concerns from ADR-0006, and why they don't hold

**"Long-running ingestion doesn't belong in a route handler."** True in serverless, where the
timeout is the constraint. This runs in a container via compose, where a route handler is just
Node with no execution limit. The concern was imported from a deployment model I'm not using.

**"The eval harness needs a headless entry point."** The real requirement, and it doesn't need a
separate service — it needs the retrieval core to have no framework coupling. Solved by directory
discipline (below), not by a process boundary.

## Decision

One Next.js application.

```
app/            routes + UI — collections, upload, chat, citations, trace panel
app/api/        route handlers — thin. Parse request, call lib/rag, shape response.
lib/rag/        the retrieval core. Plain TypeScript. Zero Next imports.
                ingest, chunk, embed, retrieve, generate, provider adapters
scripts/        headless entry points, incl. the eval harness (tsx scripts/eval.ts)
```

**The binding constraint: nothing in `lib/rag/` may import from `next`.** No `NextRequest`, no
`next/headers`, no server actions. It takes plain arguments and returns plain values. That is
what makes the core unit-testable, makes the eval harness runnable without a server, and keeps
the option of extracting a service later if it ever earns its keep.

Route handlers stay thin enough that reading `lib/rag/` is reading the whole system.

## Consequences

- Compose drops to three services: `web`, `postgres`, `chroma`. Smaller surface, faster cold
  start for a reviewer, fewer things that can fail on first run.
- One `package.json`, one Dockerfile, one type system, no CORS.
- The "where is the RAG?" answer is a directory, which is a better answer than a service anyway.
- **Risk: the constraint erodes.** It's easy to reach for a Next import inside `lib/rag/` under
  time pressure, and once one leaks in the eval harness breaks. Worth an ESLint rule restricting
  imports in that directory — cheap, and it's a concrete answer to the brief's question about
  engineering standards and keeping AI-assisted code to my preferences.
- If deployed to Vercel later, ingestion becomes a timeout problem again. Not a problem for the
  submission; belongs in the productionisation section as "ingestion moves to a queue and a
  worker", which is the correct answer there regardless.
