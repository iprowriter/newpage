# Specification

What gets built. Decisions live in [`docs/adr/`](docs/adr/) and are referenced, not re-argued.
Build order and what's cuttable is [`docs/scope.md`](docs/scope.md).

---

## 1. What it is

A document Q&A system. You create a **collection**, upload documents into it, and ask questions
scoped to that collection. Answers cite the exact source chunks they came from, and the system
refuses rather than guesses when retrieval is weak.

Demo corpus is FDA guidance split into two departments — Clinical Operations and Manufacturing
Quality — chosen because their vocabulary overlaps, which makes collection isolation a real test
rather than a trivial one (ADR-0017).

## 2. Scope

**In:** collections, PDF/text ingestion, structure-aware chunking, local embeddings, filtered
vector retrieval, grounded generation with citations, refusal on weak retrieval, a trace viewer,
an eval harness, Docker Compose.

**Out, and stated in the README:** auth and real multi-tenancy, `.docx`/OCR/scanned PDFs
(ADR-0018), voice input (ADR-0005), conversation memory beyond the current thread, incremental
re-indexing, async ingestion queues.

## 3. Architecture

```
┌──────────────────────────────────────────────────────┐
│  web  (Next.js, TypeScript)                          │
│                                                      │
│   src/app/        UI: collections, chat, traces      │
│   src/app/api/    thin route handlers                │
│   src/lib/rag/    retrieval core — no next imports   │
│   scripts/        headless entry points (eval, seed) │
└───────────────┬──────────────────────┬───────────────┘
                │                      │
        ┌───────▼──────┐       ┌───────▼───────┐      ┌──────────────┐
        │  postgres    │       │    qdrant     │      │  Gemini API  │
        │              │       │               │      │      or      │
        │ collections  │       │ one vector    │      │ Ollama (host)│
        │ documents    │       │ collection,   │      └──────────────┘
        │ chunks (meta)│       │ filtered by   │
        │ query_traces │       │ collection_id │
        │ eval_runs    │       │               │
        └──────────────┘       └───────────────┘
```

Three compose services (ADR-0007, ADR-0010, ADR-0016). No Python anywhere (ADR-0011).

**Binding constraint:** nothing under `src/lib/rag/` imports from `next`. Enforced by an ESLint
import rule. This is what keeps the core unit-testable and lets `scripts/eval.ts` run the whole
pipeline headless with no server (ADR-0007).

> Next.js API specifics — route handler signatures, config conventions — get verified against the
> installed version's own docs before any code is written, not assumed from memory.

## 4. Data model

### Postgres

| Table | Purpose |
|---|---|
| `collections` | id, name, description, retrieval config (chunk size, top-k), timestamps |
| `documents` | id, collection_id, filename, mime, page count, ingest status, error, timestamps |
| `chunks` | id, document_id, collection_id, chunk index, page, heading path, char offsets, display text |
| `query_traces` | one row per query — see §9 |
| `eval_runs` / `eval_results` | one row per run and per question — see §8 |

`chunks` holds the **display text** and positional metadata. Qdrant holds the vector and a
minimal payload. Chunk text lives in Postgres so citations can be rendered and highlighted
without a vector round-trip.

### Qdrant

One collection. Each point:

```
id       chunk id (matches postgres)
vector   embedding of "heading breadcrumb + chunk body"   (ADR-0012)
payload  { collection_id, document_id, page, chunk_index }
```

Collection scoping is a **payload filter on `collection_id`**, not a separate Qdrant collection
(ADR-0010).

## 5. Ingestion

```
upload → extract → structure → chunk → embed → write
```

1. **Extract** — pdfjs-dist for PDF, raw read for txt/md (ADR-0018). Zero extracted text is a
   hard failure with a clear message, never a silent empty ingest.
2. **Structure** — build a tree of headings, paragraphs, lists. Strip repeating headers/footers.
3. **Chunk** — pack contiguous blocks to a token budget without crossing heading boundaries
   unless a section exceeds the budget; one-to-two sentence overlap at paragraph granularity
   (ADR-0012).
4. **Embed** — local model via Ollama, always (ADR-0004). The **embed text** carries the heading
   breadcrumb; the **display text** does not. Two representations per chunk — a subtle trap, and
   §11 tests it.
5. **Write** — chunk rows to Postgres, points to Qdrant. Document status moves
   `pending → processing → ready | failed`.

Ingestion runs inline in a route handler. Fine in a container; becomes a queue and a worker in
production, which is what the productionisation section will say (ADR-0007).

## 6. Retrieval and generation

A LangGraph graph. LangGraph orchestrates control flow only — Qdrant, embeddings and prompts are
called directly, with no LangChain retrieval abstractions (ADR-0013).

```
        ┌──────────┐
        │ retrieve │◄─────────────┐
        └────┬─────┘              │
             ▼                    │ once only
        ┌──────────┐   weak   ┌───┴─────┐
        │  grade   ├─────────►│ rewrite │
        └────┬─────┘          └─────────┘
             │ ok                  │ still weak
             ▼                     ▼
        ┌──────────┐          ┌─────────┐
        │ generate │          │ refuse  │
        └──────────┘          └─────────┘
```

- **retrieve** — embed query, search Qdrant filtered by `collection_id`, top-k from the
  collection's config.
- **grade** — score threshold plus a coverage check. Cheap and deterministic first; an LLM grader
  only if the cheap version proves insufficient.
- **rewrite** — one rewrite, then stop. **The retry is hard-bounded**; an unbounded loop against a
  paid API is the obvious failure mode and §11 tests it.
- **generate** — answer strictly from retrieved context, with citations.
- **refuse** — say what was missing, not just "I don't know".

## 7. Guardrails and invariants

These are the behaviours the submission is actually evidencing.

1. **Answer only from retrieved context.** Enforced in the prompt and measured by groundedness
   in §8, not assumed.
2. **Refusal is a first-class path**, not an error state. Measured by the negative cases in §8.
3. **Collection isolation cannot be bypassed.** *Invariant:* `src/lib/rag/` exposes a **single
   retrieval entry point that takes `collectionId` as a required argument** and builds the filter
   itself. No caller assembles its own filter. Under ADR-0010 isolation is a filter rather than a
   physical partition, so a forgotten filter leaks silently instead of erroring — the enforcement
   point is the mitigation, and §11 tests it. (Closes open question 13.)
4. **Every citation resolves** to a real chunk in the answering collection. A citation that
   doesn't resolve is a bug, not a formatting quirk.
5. **Pinned model IDs.** No floating aliases anywhere (ADR-0014).

## 8. Eval harness

`scripts/eval.ts`, headless, no server. ~30 hand-written questions over the demo corpus
(ADR-0015, ADR-0017).

**Retrieval** — each question labelled with its answer-bearing chunk(s). Recall@k and MRR.
Deterministic, no judge, seconds to run.

**Generation** — groundedness and citation correctness by LLM-as-judge against a rubric held in
version control, plus fixed string assertions as a floor that works even when the judge doesn't.

**Negative cases** — ~10 unanswerable questions across five categories (ADR-0017 §unanswerable):
in-domain/out-of-corpus, out-of-collection, false premise, answerable-shaped but unstated, and
wrong-domain. Refusal rate on these is the headline number for this audience.

Every run persists to Postgres with pinned model ID, chunk config and retrieval config, so the
comparisons the README promises — 350 vs 800 token chunks, hosted vs local, hybrid vs dense — are
queries against real rows rather than remembered numbers.

## 9. Observability

Traces persist to Postgres and render at `/traces` in the app, so the reviewer sees them on their
own queries with no account and no extra containers (ADR-0016).

Each trace: query, collection filter applied, retrieved chunk ids with scores, grade decision,
whether rewrite-retry fired, per-stage latency, token counts, pinned model id, refusal decision
and reason.

OpenTelemetry spans are emitted alongside, following the GenAI semantic conventions so a vendor's
LLM view works without a mapping layer:

```
rag.query                     collection id, top-k, outcome, rewrite fired, refusal reason
├─ rag.embed_query            embedding model
├─ rag.search                 collection id (the isolation boundary), result count, top score
├─ rag.grade                  top score, result count, branch taken
└─ gen_ai.chat                gen_ai.system, gen_ai.request.model, input/output tokens

rag.extract                   document id, mime type, page count      (ingest)
rag.embed_documents           chunk count, embedding model            (ingest)
```

No exporter is wired and no collector runs in Compose — that would take the stack from six
services to seven for a demo whose traces already render in-app. With no
`OTEL_EXPORTER_OTLP_ENDPOINT` the SDK records spans and drops them, so the instrumented path is
identical in dev, in tests and in production, and shipping to Langfuse, Datadog or Honeycomb is
one environment variable.

## 10. Surfaces

### Routes

| Route | Purpose |
|---|---|
| `POST /api/collections` · `GET /api/collections` | Create and list |
| `POST /api/collections/:id/documents` | Upload and ingest |
| `DELETE /api/documents/:id` | Delete — see below |
| `POST /api/query` | Ask, scoped to a collection. Streams. |
| `GET /api/traces` · `GET /api/traces/:id` | Trace viewer data |

**Deletion across two stores** (closes open question 11): delete Qdrant points by filter first,
then Postgres rows. Qdrant-first means a partial failure leaves orphaned Postgres rows —
invisible to retrieval and cleanable — rather than orphaned vectors, which would remain
retrievable and could surface as a citation to a deleted document. Failure marks the document
`delete_failed` for a reconciliation pass rather than failing silently. Tested in §11.

### UI

Design tokens and restraint rules: ADR-0021. Flows and rationale: ADR-0019.

**Shell** — collections in a left sidebar (name, document count). Header carries the
light/dark toggle and the local/hosted provider switch. Violet accent, semantic tokens only.

**Collection view — the only page type.** The landing experience is a seeded *Quick start*
collection, not a separate ephemeral mode (ADR-0019), so there is exactly one page to build:

- Upload, then documents listed with date added, ingest status
  (`pending / processing / ready / failed`) and chunk count. Delete asks first.
- Empty state is the upload target. After first ingest: *"What do you want to know?"* plus three
  starter questions generated at ingest from the document's heading tree and stored.
- Ask, or click a suggestion. Answer streams in with inline citations; each citation opens the
  source chunk with heading path and page.
- Under every answer: the model that produced it and its latency, plus an expandable **how did I
  get this** — retrieved chunks with scores, the grade decision, whether rewrite-retry fired.
- Two follow-up questions, derived from the retrieved chunks and returned as structured output in
  the *same* generation call as the answer.

**Refusal state** — a designed surface, not an error (ADR-0019, and `--refusal` uses `--warn`
rather than `--danger` per ADR-0021). Shows what was searched, what came back and at what scores,
why it fell below threshold, whether a rewrite was attempted, and what to try instead.

**Traces** (`/traces`) — recent queries, drill into one, everything in §9.

**Not built:** authentication. `collectionId` comes from the request body, which is correct for a
demo and wrong for production; the README states the session-derived design and names the single
function that would change (ADR-0020).

## 11. Testing

Not coverage theatre. Four things that fail silently:

1. **Chunk boundaries** — heading boundaries respected, budget honoured, overlap correct.
2. **Two representations** — embed text carries the breadcrumb, display text doesn't (§5.4).
3. **Isolation** — a query scoped to Clinical Operations never retrieves a Manufacturing Quality
   chunk, asserted against the single entry point of §7.3.
4. **Retry bound** — the rewrite edge fires at most once, then refuses.

Plus deletion ordering (§10), and citation resolution (§7.4). The LLM is mocked at the provider
seam (ADR-0003) so these run fast and free.

## 12. Configuration

Env-driven, `.env.example` with placeholders and no real key ever committed (ADR-0009).

```
LLM_PROVIDER=gemini|ollama
GEMINI_API_KEY=            # reviewer supplies their own; free tier is sufficient
GEMINI_MODEL=              # pinned id, never -latest
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=              # pinned
EMBEDDING_MODEL=           # pinned; changing it means drop + reindex
DATABASE_URL= / QDRANT_URL=
```

Default path is Gemini. Ollama documented below it, not presented as an equal choice (ADR-0009).

## 13. Known limitations

Stated in the README rather than hidden. Multi-column PDFs may interleave; tables flatten; no OCR;
English single-domain corpus only; no auth; ingestion is synchronous; trace retention is unbounded;
LLM-as-judge is itself a source of error.

## 14. Before submitting

Clone into a clean directory, `docker compose up`, follow only the README. Twice — once mid-build,
once at the end. The risk with containerisation isn't Docker, it's an untested compose file
(open question 12).
