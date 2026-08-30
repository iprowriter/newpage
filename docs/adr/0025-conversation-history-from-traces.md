# 0025. Conversation history is read back from the trace table

**Status:** Accepted
**Date:** 2026-08-30

## Context

The Ask view kept a thread in React state and cleared it whenever the collection changed. Click
another collection and come back, and every question you had asked was gone. For something
presented as a chat, that is a missing feature rather than a rough edge: the thread is the record
of what you have already established, and re-asking to recover it costs a model call each time.

The questions were never actually lost. Every query already writes a `query_traces` row with the
question, the answer, the refusal reason, the retrieved chunk ids with their scores, the pinned
model id and the timings, and there was already an index on `(collectionId, createdAt)`, which is
precisely the read a history view needs.

## Options considered

**A `messages` table alongside `query_traces`.** The clean-on-paper answer: product data separate
from observability data. It also means writing the same facts twice on every query, and two rows
that must agree forever. The first time they disagree, the trace viewer and the chat show different
histories for the same question, and there is no way to tell which one lied.

**Keep it on the client** (`localStorage` or session state). Cheapest, and wrong. The history would
be per browser, invisible to the trace viewer, gone in a private window, and impossible to reason
about when the answer's sources have since been deleted.

**Read it back from `query_traces`.** No second write, no drift, and history and observability
agree by construction because they are the same row.

## Decision

Read history from `query_traces`, most recent 20 per collection, oldest first, via
`GET /api/collections/[id]/history`.

Three things followed from doing it:

**A `citations` column was added.** The trace recorded which passages were *retrieved* but not
which ones the answer actually *used*, so a restored answer lost its attribution. That gap existed
independently of this feature: a trace that cannot answer "did it cite the passage that mattered"
is incomplete for observability too. Rows written before the migration have an empty array and
show no attribution line, which is accurate rather than reconstructed.

**Chunk text is rejoined on read.** The trace deliberately stores chunk ids without their text,
because duplicating it would grow the table by the size of the corpus for every question. History
does one join for the whole page. When a chunk is gone because its document was deleted, the source
is shown marked unavailable rather than dropped, so an old answer does not appear better sourced
than it now is.

**`error` traces are excluded.** Their stored reason is the upstream diagnostic, not the sentence
the reader saw, so replaying one would put internal text on screen. They remain in `/traces`.

## Consequences

**Easy.** One endpoint and one join. History, the trace viewer and the eval seed set are all the
same rows, so a thumbs-down in the chat is the same object an eval case would be built from. Rated
answers keep their rating when the thread is restored.

**Hard, and this is the real cost.** Trace retention and conversation retention are now the same
policy, and they should not be. The productionisation plan calls for expiring and sampling traces;
applied naively, that would silently delete people's chat history. The fix is to expire the
diagnostic columns (retrieved ids, scores, token counts, timings) on a schedule while keeping the
question, answer and citations for as long as the collection lives. That is a migration and a job,
not a redesign, and it is named in the README rather than discovered in production.

**Accepted.** History is capped at 20 exchanges per collection with a pointer to `/traces` for the
rest, and earlier turns are still not fed back into the prompt. The thread is now durable; the
model's view of it is still one question at a time (see the limitations section of the README).
