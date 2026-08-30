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

**Tier 0 and Tier 1 of [`docs/scope.md`](docs/scope.md) are complete.** The application works end
to end, containerised, with measured numbers.

| | |
|---|---|
| Corpus | 8 FDA guidance PDFs, 778 chunks, two collections |
| Stack | Next.js 16 · Postgres · Qdrant · Ollama (embeddings) · Jaeger |
| Providers | Gemini (default, pinned) · Ollama (local) |
| Tests | 48, no network, under 3s |
| Eval | 26 cases — hosted 26/26; local 12/26 (all answerable false-refused) |
| Cold start | `docker compose up` verified from empty volumes |

Everything below is still to do, and the first item matters most.

1. **The submission README.** This file is working notes. The real one is deliverable #2 with
   nine required subsections, and the brief says twice that it must be my own thinking. The
   material is in [`docs/adr/`](docs/adr/) — that is what those were for.
2. **Screenshots** (deliverable #3), and a video if time allows.
3. **Final cold-start check** — open question 12 says do it twice. The mid-build run passed; the
   Dockerfile and Compose have changed since.
4. Tier 2, only with an eval number attached. Hybrid retrieval is the strongest candidate:
   Qdrant has native sparse vectors and a fusion API, so it is configuration rather than
   hand-rolled BM25.

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
