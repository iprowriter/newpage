# 0026. The collection summary is remembered, not regenerated

**Status:** Accepted
**Date:** 2026-08-30

## Context

ADR-0019 put a "Summarise this collection" button on the Ask view: orientation for someone opening
a collection they did not build, generated on demand because it costs a model call and a returning
reader does not need it.

The generation half of that was already right. The *keeping* half was never built. The summary was
written to `Collection.summary` with a fingerprint of its member document ids, and then the client
never read it back — `CollectionSummary` opened at `useState(null)` and only ever displayed what
the current component instance had fetched. Two consequences, both of which look like the feature
is broken:

- Navigate away and back, and the summary is gone. The row is still in Postgres. Pressing the
  button returns the cached text instantly, which makes the loss look deliberate and pointless.
- Ask a question and it is gone. The card rendered inside the `exchanges.length === 0` branch, so
  the first question destroyed the orientation you had just read to decide what to ask.

So the decision here is not "should there be a summary" — that is ADR-0019 — but **when it is
generated, and how long it stays**.

## Options considered

**Generate at ingest and store it.** Every collection is warm; nobody ever waits. It costs a model
call per upload, and the fingerprint is over the *set*, so uploading four documents generates four
summaries and discards three. It also couples ingestion to a provider: today an upload succeeds
with no API key configured (starter questions already degrade gracefully through `safeProvider()`),
and this would put a model call on the critical path of a file upload for output nobody asked for.
In a chat — one document, one question, thrown away — that call is pure waste.

**Generate at ingest, but only for the first document into an empty collection, in the background.**
One call rather than N, warm for the common case. Rejected on the failure mode: ingestion runs
inline in the route handler with no queue (ADR-0016 keeps the service count down), so background
work has nowhere to report a failure. A summary that silently never appears is indistinguishable
from one that was never asked for, and the reader has no button to retry because the button only
exists when there is no summary.

**Keep it on demand, and serve the stored one back.** No model call happens unless someone asks for
one, which is the property ADR-0019 chose. The only new work is a read: the summary rides along
with `GET /api/collections/[id]`, which the view already issues on open and again after every
ingest.

## Decision

On demand to generate; remembered thereafter.

- `GET /api/collections/[id]` returns `summary` — **null unless the stored fingerprint still
  matches the ready document set**, so a caller cannot render a stale one by forgetting to check —
  and `summaryStale`, which separates "never summarised" from "summarised, then the documents
  changed". The UI words those differently: the second says so, in place of the button's silence.
- The card lives above the thread rather than inside the empty-thread branch. It is expanded while
  there is nothing else to read and collapsed to a "What is in here" row once there is a
  conversation, so it stays reachable without competing with the answer.
- A **Summarise again** button under the summary posts `force=1`, which is the only way past the
  fingerprint cache. Without it a second press returns identical text and reads as a dead control.
- The request now carries `provider`, as `/api/query` already did. This was a real bug rather than
  a new feature: with the toggle on Local and no `GEMINI_API_KEY`, questions worked and summarising
  failed with a key error for a provider the reader was not using.
- `summaryFingerprint()` moved to `src/lib/summary.ts` because two routes now depend on agreeing
  about it. Computed in two places it would eventually disagree, and the failure mode is a summary
  that outlives its documents.

## Consequences

**Easy.** No new endpoint, no second loading state, and no cache to invalidate by hand: because
ingest already triggers the same refetch, an upload retires the summary it invalidated in the same
round trip that reports the upload. The document list and the summary beside it can never disagree
about which documents are in the collection, because one response produced both.

**Hard.** The fingerprint covers the document *set*, not the documents' contents and not the model
that wrote the summary. Re-ingesting the same file under the same id would not invalidate it, and
switching provider leaves a summary written by the other one — deliberately, since invalidating on
provider would regenerate on every toggle. Both are what "Summarise again" is for, which means the
staleness the system cannot detect is handed to the reader rather than solved.

**Accepted.** A collection whose documents have changed shows no summary at all until someone
regenerates it, even though text exists. That follows ADR-0019's rule that a stale summary is worse
than none — it describes a collection the reader is not looking at, and nothing on screen would say
so — but it does mean the orientation disappears at exactly the moment a new document made it most
useful. The banner naming the change is the compromise; generating one unasked is what this ADR
declines to do.
