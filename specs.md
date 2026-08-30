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

**In:** collections *and chats* (ADR-0022), PDF/text ingestion, structure-aware chunking, local
embeddings, filtered vector retrieval, grounded generation with citations, refusal on weak
retrieval, span-level attribution from a highlighted claim back to its passage (ADR-0024),
persistent conversation history per collection (ADR-0025), collection summaries, answer feedback,
typed provider errors with retry, an in-app trace viewer plus OpenTelemetry to Jaeger, an eval
harness, Docker Compose.

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

Seven compose services: `postgres`, `qdrant`, `ollama` (embeddings only), `jaeger`, `migrate`
(runs to completion, gates `web`), `web`, `seed` (runs after `web` is serving). No Python in the
application (ADR-0011); Qdrant and Ollama are prebuilt images.

Ollama is containerised **for embeddings only** — the GPU argument that keeps generation on the
host (ADR-0003) does not apply to embedding models, and without a guaranteed embedding endpoint
`docker compose up` yields an app that cannot ingest anything at all.

**Binding constraint:** nothing under `src/lib/rag/` imports from `next`. Enforced by an ESLint
import rule. This is what keeps the core unit-testable and lets `scripts/eval.ts` run the whole
pipeline headless with no server (ADR-0007).

> Next.js API specifics — route handler signatures, config conventions — get verified against the
> installed version's own docs before any code is written, not assumed from memory.

## 4. Data model

### Postgres

| Table | Purpose |
|---|---|
| `collections` | id, name, **kind (`collection` \| `chat`)**, description, retrieval config, cached summary + document fingerprint |
| `documents` | id, collection_id, filename, mime, page count, ingest status, error, timestamps |
| `chunks` | id, document_id, collection_id, chunk index, page, heading path, char offsets, display text |
| `query_traces` | one row per query — see §9 — including which sources the answer cited and human feedback (up/down + note) |
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
6. **No threshold is a guess.** Every constant that decides an outcome ships with the script that
   measured it (`npm run calibrate`, `npm run calibrate:attribution`) and the distribution is
   recorded in its ADR. Set from fixtures rather than the real corpus, a threshold is set from
   text that shares its own vocabulary; ADR-0024 records where that went wrong.

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

Labels are **text snippets, not chunk ids** — chunk ids are per-install UUIDs, and any label tied
to a chunk is invalidated by the chunk-size comparison this harness exists to run. A retrieval hit
means a retrieved chunk came from the expected file and contained an expected phrase.

The judge is **pinned to the hosted model regardless of what is under test** (`--judge-provider`).
Swapping the grader alongside the subject changes two variables at once, and asking a 3B model to
detect its own unsupported claims is asking it for the thing it is worst at.

Every run persists to Postgres with pinned model id, chunk config and retrieval config.

**Measured, 26 cases (12 answerable, 14 negative):**

| | recall@6 | MRR | grounded | citations | refusal | false refusal |
|---|---|---|---|---|---|---|
| hosted `gemini-3.6-flash` | 100% | 0.714 | 100% | 75% | 100% | **0%** |
| local `llama3.2:3b` | 100% | 0.714 | — | — | 100% | **100%** |

Retrieval is identical because it does not involve the generation model. Both score a perfect
refusal rate — which is precisely why refusal is never reported alone: the local model earns its
100% by declining all twelve questions it should have answered.

The cause is specific, and was checked rather than assumed: the local model emits **valid JSON
containing the correct answer**, then sets `sufficient: false`. Not a schema failure, not a
retrieval failure — a self-assessment failure. Deliberately not patched: overriding `sufficient`
when the answer "looks substantial" would recover the local path by destroying the guardrail that
catches sources on the right topic which never state the answer.

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

**Jaeger ships in Compose** (ADR-0023, revising ADR-0016) and the exporter points at it by
default, so the OpenTelemetry claim is something a reviewer clicks rather than reads. `/traces`
links to it. Override `OTEL_EXPORTER_OTLP_ENDPOINT` and the same spans go to Langfuse, Datadog or
Honeycomb instead — that one variable is the entire integration.

The two views answer different questions and neither subsumes the other: `/traces` is this
system's story (chunk text, scores, grade decisions, refusal reasons, human feedback); Jaeger is
the standard shape, with the downstream HTTP calls to Qdrant, Ollama and Gemini nested under each
stage. Jaeger stores in memory, so traces do not survive a restart — correct for a demo, and
named as such in productionisation.

## 10. Surfaces

### Routes

| Route | Purpose |
|---|---|
| `POST /api/collections` · `GET /api/collections` | Create and list (collections and chats) |
| `POST /api/chats` | Create a chat — called by the first upload, not on click |
| `POST /api/chats/:id/promote` | Move a chat's documents into a collection, then delete the chat |
| `POST /api/collections/:id/summary` | Generate or serve a cached collection summary |
| `DELETE /api/collections/:id` | Delete a collection or chat and everything in it |
| `POST /api/traces/:id/feedback` | Record a reader's up/down verdict on an answer |
| `POST /api/collections/:id/documents` | Upload and ingest |
| `DELETE /api/documents/:id` | Delete — see below |
| `POST /api/query` | Ask, scoped to a collection. Streams. |
| `GET /api/collections/:id/history` | Past questions and answers, rebuilt from `query_traces` (ADR-0025) |
| `GET /api/traces` · `GET /api/traces/:id` | Trace viewer data |

**Deletion across two stores** (closes open question 11): delete Qdrant points by filter first,
then Postgres rows. Qdrant-first means a partial failure leaves orphaned Postgres rows —
invisible to retrieval and cleanable — rather than orphaned vectors, which would remain
retrievable and could surface as a citation to a deleted document. Failure marks the document
`delete_failed` for a reconciliation pass rather than failing silently. Tested in §11.

### UI

Design tokens and restraint rules: ADR-0021. Flows and rationale: ADR-0019.

**Shell** — a pinned sidebar (the viewport scrolls in two independent panes) with **Collections**
and **Chats** as separate sections, each entry deletable on hover. "New chat" is a link to a draft
that persists nothing until its first upload — an eagerly-created chat leaves an empty row behind
on every click that goes nowhere. Provider and theme toggles sit at the bottom, above a link to
Jaeger. Violet accent, semantic tokens only, tabular figures on every number.

**Collection view — the only page type**, for collections and chats alike (ADR-0022). A segmented
control switches between **Ask** and **Sources**; Sources is paginated. A chat additionally offers
"Move to collection".

- Upload, then documents listed with date added, ingest status
  (`pending / processing / ready / failed`) and chunk count. Delete asks first.
- Empty state is the upload target. After first ingest: a **Summarise** button (generated on
  demand from each document's headings and sampled text, cached against a fingerprint of the
  member document ids), then *"What do you want to know?"* plus three starter questions generated
  at ingest — one per document across the most recent documents, so a multi-document collection
  does not look narrower than it is.
- Ask, or click a suggestion. Answer streams in with inline citations; each citation opens the
  source chunk with heading path and page.
- Highlight any sentence of an answer and a **"Where is this from?"** control traces it back to the
  passage it came from, marked in place (ADR-0024). Lexical matching, so it reports `strong`,
  `closest match`, or that no single passage supports the selection. Never the word "citation".
- The thread **persists per collection** (ADR-0025). Leaving and returning restores the questions,
  their answers, their sources and any rating given, read back from the same rows the trace viewer
  uses. Capped at the 20 most recent, with a pointer to `/traces` for the rest.
- Under every answer: the model that produced it and its latency, an expandable **how did I get
  this** (retrieved chunks with scores, grade decision, whether rewrite-retry fired), and
  **thumbs up/down** — placed there because provenance and judgement are the same act, and each
  rating lands on the trace beside the chunks and prompt that produced it.
- Two follow-up questions, derived from the retrieved chunks and returned as structured output in
  the *same* generation call as the answer.

**Refusal state** — a designed surface, not an error (ADR-0019, and `--refusal` uses `--warn`
rather than `--danger` per ADR-0021). Shows what was searched, what came back and at what scores,
why it fell below threshold, whether a rewrite was attempted, and what to try instead.

**Traces** (`/traces`) — recent queries, drill into one, everything in §9.

**Failure state** — a third surface, distinct from both. A refusal uses `--warn` because it is
the system working; a *failure* uses `--danger` because it is not. Provider errors are typed
(`unavailable`, `rate_limited`, `auth`, `model_retired`, `model_missing`, `network`), retried with
backoff and jitter where that could help, and rendered with the action that fits — including
"Run locally instead" when the hosted model is overloaded, which is exactly when the local path
earns its keep.

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

Plus **deletion ordering** (§10) — asserted by recording call *sequence*, since the failure it
guards against is a later edit that looks harmless — **citation resolution** (§7.4), and the
**retry policy** in both directions: that it retries transient failures up to a bound, and that it
does *not* retry a rejected key.

Two later features added their own, both for the same reason: they fail quietly rather than loudly.

5. **Attribution bands** — that surviving wording scores as `strong`, that a paraphrase and a claim
   assembled from two passages both land in `partial` because lexical overlap cannot separate them
   (ADR-0024), and that an unsupported claim is declined outright rather than pointed somewhere.
6. **History reconstruction** (ADR-0025) — that chunk text is rejoined onto sources the trace
   stored only ids for, that a passage whose document has since been deleted is marked unavailable
   rather than dropped, that the conversation comes back oldest-first from a newest-first query,
   and that `error` traces stay out of the thread. A broken rejoin returns empty passages without
   throwing, which is exactly the kind of failure that reaches a screenshot.

The LLM is mocked at the provider seam (ADR-0003), so all 48 tests run in under three seconds with
no network and no cost.

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
