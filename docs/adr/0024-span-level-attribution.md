# 0024. Span-level attribution: lexical, client-side, and allowed to decline

**Status:** Accepted
**Date:** 2026-08-29

## Context

Citations are answer-level. `AnswerPayload.citations` says "sources 1, 3 and 4 were used", which
answers a question the reader is not asking. Reading a specific claim, they want to know where
*that claim* came from — and under ADR-0019 the whole provenance argument is that a citation you
cannot inspect is a claim rather than evidence. Answer-level citations are exactly that, one level
up.

The interaction: highlight a span of the answer, click "Where's this from?", and the supporting
passage opens with the matching sentence marked.

## Options considered

**Ask the model to emit per-sentence markers.** Most precise, since the generator knows which
chunk it used. Costs a prompt change, a parser, and format drift as a new failure mode — and it
puts a UI feature on the critical path of answer quality, where a regression shows up as a worse
answer rather than as a worse highlight. It would also invalidate the eval baseline.

**Embed each answer sentence and compare to chunk embeddings.** Handles paraphrase, which is the
case lexical matching is weakest on. Costs an embedding round trip per answer, on the local
embedding model, in the request path — real latency for a secondary feature, and a network
dependency in a component that currently has none.

**Lexical overlap against the chunks already in the browser.** `Source.displayText` is an exact
slice of the document (ADR-0012) and is already client-side when the answer renders. Weakest at
paraphrase; free everywhere else.

## Decision

Lexical, client-side, in `src/lib/rag/attribute.ts`: weighted term overlap between the selection
and every sentence window of each retrieved passage, scored with an inverse frequency computed
**over the retrieved set rather than the corpus** — the comparison is only ever between the six or
so passages that came back, so a term common to all of them tells you nothing about which one a
claim came from, and weighting it corpus-wide would let shared boilerplate decide the match.

No prompt change, no graph change, no extra call, so it cannot move an eval number. That was the
deciding property, not the cost.

**Three outcomes, because measurement supports three and not two.** On the corpus:

| | Score | Runner-up margin |
|---|---|---|
| Verbatim / lightly reworded | 0.8–1.0 | 0.6–0.8 |
| Heavy paraphrase | 0.40–0.50 | 0.04–0.28 |
| Claim assembled from two passages | ~0.42 | ~0.24 |
| Nothing supports it | 0.0 | — |

I built this expecting to detect the third row — "this claim is synthesised, it belongs to no
single passage" was the property I wanted most, because it is the refusal ethic applied to
attribution. **It is not detectable this way.** Synthesised claims and honest paraphrases score in
the same band, and the runner-up margin separates them backwards: 0.24 for synthesis against
0.04–0.11 for genuine paraphrase. Both a threshold and a dominance test were tried against the
numbers above and neither holds.

So the API reports what the scores can actually distinguish: `strong` above 0.6, `partial` between
0.35 and 0.6, and null below — where the reader is told no passage supports the selection rather
than being handed the least-bad guess. `partial` is worded as "closest supporting passage… may be
paraphrasing or drawing on more than one", which is true of both cases in that band.

Everything is labelled "closest supporting passage", never "citation".

## Consequences

**Easy.** Pure function over plain strings, so it is unit-tested with no network and no fixtures
beyond the strings themselves (11 tests, in the existing sub-3s suite). Zero latency. Deleting it
is deleting one file and two props. Verified end to end against a live answer whose top three
retrieved passages were near-duplicates on the same subject: both answer sentences attributed to
the correct passage and page, and an invented claim declined.

**Hard.** A heavily paraphrased claim lands in `partial` even when it came cleanly from one
passage, so the UI hedges where it did not need to. Sentence-window granularity means a claim
spanning a sentence boundary highlights up to three sentences. Both are the cost of not putting
this on the answer path.

**Accepted cost.** The band that matters most — is this claim actually grounded in one passage, or
is the model assembling? — is the one the method cannot resolve. Semantic matching against the
existing chunk embeddings is the upgrade path, and per ADR-0015 it should ship with a number
attached rather than on the assumption that it is better.
