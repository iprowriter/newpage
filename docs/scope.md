# Build order

The point of this file is to know what's cuttable *before* I start, so that running out of time
degrades the submission gracefully instead of leaving something half-finished in the middle.

Their words: *"a solid & well-engineered basic solution A LOT MORE than an over-engineered
complex one"* and *"Start simple, then enhance."* Take that literally.

---

## Tier 0 — The spine

If this doesn't work, nothing else counts. Build it end-to-end and thin before widening anything.

1. **Ingest** — upload a file, parse it, chunk it, embed the chunks, store them with metadata
   (source doc, page/offset, collection).
2. **Retrieve** — embed the query, search, return top-k scoped to one collection.
3. **Generate** — assemble retrieved chunks into a prompt, answer with inline citations that
   point back to a real chunk.
4. **Refuse** — when retrieval comes back weak, say so instead of answering from model priors.
   This is Tier 0, not a polish item. It's the single most load-bearing behaviour for this
   audience, and per ADR-0013 it's also the reason the orchestration graph has branches at all:
   retrieve → grade → (weak? rewrite, retry once) → (still weak? refuse) → generate. The guardrail
   *is* the graph. Measured by the negative cases in ADR-0015.
5. **UI** — one screen: upload, ask, read the answer, see what it cited.

Done means: I can upload a PDF, ask three questions, get three grounded answers with working
citations, and get an honest "I don't know" on a question the document can't answer.

---

## Tier 1 — Where the grade actually is

This is the tier most candidates skip in favour of features, and it's the tier the brief keeps
asking about. Do all of it before touching Tier 2.

6. **Collections** — the projects concept. Named collections, documents accumulate into them,
   retrieval filters by collection. Proves data isolation.
7. **Eval harness** — 20–30 hand-written question/answer pairs over the demo corpus. Measure
   retrieval hit rate (did the right chunk come back?) separately from answer groundedness (did
   the answer stick to it?). Separating those two is the whole point; without it I can't tell a
   retrieval bug from a prompting bug.
8. **Observability** — every query emits a trace: query, retrieved chunk ids, scores, latency
   per stage, token counts, model used. Visible in the UI or a log I can screenshot.
9. **Containerised** — `docker compose up` and it runs. No README step that says "first install
   these six things".
10. **Tests** — on the parts that fail silently: chunk boundary handling, citation resolving to
    the right span, and collection filtering actually isolating (a Marketing query must never
    retrieve an Engineering chunk). Not coverage theatre — these three.
    The isolation test carries more weight since ADR-0010: isolation is enforced by a payload
    filter rather than physical separation, so a missing filter leaks silently instead of
    erroring. See open question 13.

---

## Tier 2 — Differentiation, only after Tier 1 is done

Rule for this tier: **each item ships with an eval number attached**, or it's just a feature and
I can't defend it in the follow-up interview. Narrowed once, in the stop rules below, for items
that cannot move an eval number in the first place.

11. Citation resolves to a highlighted span in a document viewer. **Shipped, in a narrower form
    than written here** (ADR-0024): highlight a claim in the answer and the supporting passage
    opens in the provenance panel with the sentence marked, rather than opening a document viewer
    — the passage text was already on the client, so the viewer would have been new surface for
    no extra evidence. Lexical matching, so it reports `strong` / `partial` / no-match rather than
    pretending to a precision it doesn't have. Exempt from the eval rule below, on the reasoning
    stated there.
12. Hybrid retrieval (keyword + vector) with before/after eval numbers, including the honest case
    where it didn't help. **Promoted in likelihood by ADR-0010** — Qdrant has native sparse
    vectors and a fusion API, so this is configuration rather than hand-rolled BM25. Realistically
    reachable now, which makes it the most probable differentiator.
13. Local vs hosted model comparison run on the same eval set, published as a table.
14. Per-collection retrieval config (chunk size, top-k) — because a contract and an RFC don't
    want the same chunking.
15. Streaming responses.

---

## Tier 3 — The cut list

Goes in "What I'd do differently with more time". The brief explicitly says this is fine.

- Voice input. Bonus under Option 3, not Option 1 — earns nothing here. If it happens, browser
  Web Speech API only, never a local Whisper container.
- Auth and real multi-tenancy (collections demonstrate the shape without it).
- Incremental / delta re-indexing.
- Document-type-aware chunking beyond the basics (tables, figures).
- Async ingestion queue for large uploads.
- Conversation memory beyond the current thread.

---

## Stop rules

- No Tier 2 work until every Tier 1 item is done.
- Any Tier 2 item **that touches retrieval or generation** gets removed before submission unless
  it ships with an eval number.
- An item that *provably cannot move* an eval number is exempt: no prompt change, no graph change,
  nothing added to the answer path. It carries unit tests and a stated limitation in its ADR
  instead. This is a clarification of the original rule, not a loosening of it — the rule was
  aimed at unmeasured claims about answer quality, and an item that cannot affect answer quality
  cannot make one. Applying it literally would cut interface work for failing a measurement that
  cannot be run on it, which is a worse failure than the one the rule prevents. The burden is on
  the item: "cannot move an eval number" is a claim the ADR has to make explicitly and defend, and
  item 11 is the only thing currently claiming it.
- Feature count is not the differentiator. Option 1 is the option most candidates pick — the
  separation comes from citations, refusal, evals and traces, all of which are Tier 0 and 1.
