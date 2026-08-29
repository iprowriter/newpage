# Newpage assignment — working notes

Take-home for Newpage Solutions. **This is not the submission README** — that gets written last,
in my own words, once the thing exists. This file is scratch state so I know where I am.

## What I'm building

**Option 1 — Chat With Your Docs.** Retrieval-augmented Q&A over a document collection, with
a *collections/projects* concept: you can chat with a single uploaded doc, or create a named
collection (e.g. Engineering, Marketing, Legal) that accumulates documents over time and is
queried in isolation from the others.

Why Option 1: it's the only option where retrieval is genuinely load-bearing rather than
decorative. The brief grades chunking, embedding choice, retrieval approach and vector DB
directly, and Option 1 forces real decisions on all four. Option 4 (resume vs JD) fits a whole
corpus in one context window, which makes the RAG layer theatre.

See [`docs/adr/0001-choose-option-1-chat-with-your-docs.md`](docs/adr/0001-choose-option-1-chat-with-your-docs.md).

## Who's reading it

Newpage is a life-sciences digital engineering firm — pharma, biotech, regulated enterprise.
Miami + Bangalore/Chennai delivery. Their AI work is mostly Salesforce Einstein and GenAI
reporting for regulated clients.

What that implies, and it shapes everything below:

- **Provenance beats cleverness.** Every answer traceable to an exact source span.
- **Refusal is a feature.** In a regulated vertical, a confident wrong answer is a liability.
  Weak retrieval must produce "I don't know", visibly.
- **Data isolation reads as a real requirement**, not a nice-to-have. The collections concept
  maps onto "Marketing can never see Legal's documents", which is a client problem they know.
- **Local inference is a genuine selling point** — "no document leaves the machine" is the
  answer to a pharma client who can't ship documents to a third-party API.

## Current state

Nothing built. Decisions recorded in `docs/adr/` as they're made; `specs.md` gets written once
the open questions in `docs/open-questions.md` are closed.

**Stack decided.** Full-stack Next.js, TypeScript, three compose services.

```
app/            routes + UI
app/api/        thin route handlers
lib/rag/        the retrieval core — plain TS, zero Next imports
scripts/        headless entry points, incl. the eval harness
```

| Service | What |
|---|---|
| `web` | The Next.js app |
| `postgres` | Collections, documents, query traces, eval runs |
| `qdrant` | Vectors and chunk payloads — one collection, filtered by `collection_id` |

LLM: Gemini by default (pinned ID), Ollama for the local path. Embeddings always local. No
Python anywhere in the stack. LangGraph orchestrates control flow only — Qdrant is called
directly. Traces persist to Postgres and render in-app at `/traces`, with OTel emitted alongside
as the production seam.

Demo corpus is FDA guidance split into Clinical Operations and Manufacturing Quality — public
domain, and their vocabulary overlaps, which makes the isolation test meaningful rather than
trivial (ADR-0017).

**Design is settled.** [`specs.md`](specs.md) is what gets built; [`docs/adr/`](docs/adr/) is why.
The only question left open is the compose cold-start check, which stays open until submission.

Nothing is built yet. Next step is Tier 0 of [`docs/scope.md`](docs/scope.md).

## Layout

| Path | What |
|---|---|
| `docs/assignment.md` | The brief as received. |
| `docs/scope.md` | Build order. What must work, what's cuttable, what goes in "next steps". |
| `docs/open-questions.md` | Undecided. Feeds `specs.md`. |
| `docs/adr/` | Architecture decision records. One file per decision, with the reasoning. |
| `specs.md` | The design. What actually gets built. |

## Hard rule for this project

The submitted README must be my thinking, not generated prose — the brief says so twice and
they will be able to tell. AI assistance goes into code, scaffolding, and challenging my
reasoning. The written argument is mine.
