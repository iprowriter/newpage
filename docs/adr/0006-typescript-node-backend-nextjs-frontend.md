# 0006. TypeScript/Node backend, Next.js frontend, two services

**Status:** Superseded by [ADR-0007](0007-fullstack-nextjs.md)
**Date:** 2026-08-29

> **Superseded 2026-08-29.** Over-engineered for the size of this application. Two services
> for a take-home of this scope is the exact failure mode the brief warns about. The concerns
> below are real but are solved by directory discipline rather than a process boundary — see
> ADR-0007. Kept because the trade-offs it records still hold and feed the submission README.

## Context

Open question 1: one runtime or two. This constrains almost everything downstream — parsing
libraries, embedding client, vector store driver, test tooling, and the shape of the compose file.

## Options considered

**Next.js full-stack, route handlers as the backend.** Fewest moving parts, one `package.json`,
fastest for me. But it couples the retrieval core to a React framework, makes ingestion awkward
(parse → chunk → embed is long-running work that doesn't belong in a request handler that may
later run serverless), and leaves nothing clean to point a reviewer at when they ask "where is
the RAG?"

**Next.js + Python/FastAPI.** Python has the stronger ecosystem for document parsing and evals —
PyMuPDF, unstructured, ragas. Cost is two languages, two toolchains, two sets of types, and
context-switching under time pressure.

**Next.js frontend + TypeScript/Node backend.** One language across the stack, two services.

## Decision

Two services, TypeScript throughout.

- **`web/`** — Next.js. UI only: collections, upload, chat, citations, trace panel.
- **`api/`** — Node + TypeScript. Ingestion, chunking, embedding, retrieval, generation,
  provider adapters, evals.

The retrieval core lives in `api/` as ordinary TypeScript modules with no HTTP coupling, so it
can be unit-tested and run headless by the eval harness without a server in the loop.

## Rationale

- **One language.** No context-switching, no duplicated model definitions. Types can be shared
  between the two services directly.
- **The RAG core becomes a thing with a boundary.** A reviewer reading `api/` sees ingestion and
  retrieval as the subject of the codebase rather than something threaded through React route
  handlers. The brief grades readability and structure.
- **Containerisation gets more honest.** Compose already needs a vector store and (optionally)
  Ollama. `api` and `web` as separate services makes the architecture diagram real rather than
  decorative, and matches how it would actually deploy.
- **The eval harness needs a headless entry point.** Tier 1 in `docs/scope.md` requires running
  ~25 questions against the retrieval core, twice (local vs hosted, per ADR-0003). That's a CLI
  against `api/` modules, which is natural here and awkward inside Next.
- **Scaling story writes itself.** API scales independently of the frontend — container service
  for `api`, static/edge hosting for `web`. Section (c) of the submission gets easier.

## Consequences

- **Accepted cost: document parsing in Node is weaker than in Python.** No PyMuPDF, no
  `unstructured`. The options are `pdfjs-dist`, `unpdf`, or similar, and layout-aware extraction
  (tables, columns, figures) is harder. Mitigation: scope the supported formats deliberately
  (open question 10) and state the limitation in the README rather than hiding it. Complex PDF
  layouts go on the acknowledged-edge-cases list, which the brief explicitly allows.
- **Accepted cost: no ragas.** The eval harness is hand-built (open question 6). Given the brief
  wants my reasoning on quality controls, hand-built is defensible anyway — I can explain every
  number.
- Embeddings via Ollama's embedding endpoint keeps ADR-0004 intact and means one Ollama host
  serves both embeddings and optional local generation. No separate embedding runtime.
- Two services means CORS, two Dockerfiles, and a shared types boundary to maintain. Small, but
  real. Keep the API surface deliberately narrow.
- If this turns out to be over-separation for the size of the app, collapsing `api/` into Next
  route handlers later is a mechanical change, since the core has no HTTP coupling. The reverse
  would not be.

## Note

Read as: a genuinely separate Node backend service, not Next.js route handlers. If the intent
was Next full-stack with a well-factored `lib/`, this ADR is wrong and gets superseded — the
difference is one compose service and a CORS boundary, and it's cheap to change now.
