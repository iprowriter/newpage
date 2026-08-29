# 0015. Eval: retrieval and generation measured separately, with negative cases

**Status:** Accepted
**Date:** 2026-08-29

## Context

Open question 6. Tier 1 of `docs/scope.md` makes the eval harness non-optional — it's what turns
"I made these choices" into "I made these choices and here's what happened". No ragas in the
TypeScript ecosystem (ADR-0011), so it's hand-built, which is defensible anyway: I can explain
every number.

## Decision

**Measure retrieval and generation separately. Never report one blended score.**

A single number tells me something is wrong without telling me where. Splitting them is what
distinguishes a retrieval failure from a prompting failure, and that distinction is most of the
diagnostic value.

### Retrieval — deterministic, no judge

Each question is labelled with the chunk or section that actually contains the answer. Measure
recall@k and MRR. Runs in seconds, costs nothing, and is stable enough to run on every change.

### Generation — rubric-based judge plus fixed assertions

Groundedness and citation correctness (do the cited chunks actually contain the claim?) via
LLM-as-judge against a written rubric, plus a handful of deterministic string assertions that
need no judgement at all. The assertions are the floor — if the judge is having a bad day, they
still fail loudly.

### Negative cases — the metric that matters most here

**Include questions the corpus genuinely cannot answer, and measure refusal rate on them.**

Almost no submission will have this, and for a life-sciences audience it's the most relevant
number on the page: a confident wrong answer is a liability, not an inconvenience. If the system
answers 8 out of 10 unanswerable questions, that's the finding, and reporting it honestly is
worth more than a table where everything is green.

### Writing the questions

Not by reading my own chunks — that flatters my own retrieval. Written from the source documents
before looking at chunk boundaries, and deliberately including:

- questions needing information spanning two sections (tests chunking, ADR-0012)
- questions whose vocabulary doesn't match the source wording (tests semantic vs keyword, and
  feeds the hybrid retrieval comparison in Tier 2)
- the unanswerable set above

~30 questions total. Enough to be informative, small enough to write honestly by hand.

## Consequences

- Runs are stored in Postgres with model ID (ADR-0014), chunk config and retrieval config, so
  "350 vs 800 tokens" is a query rather than a spreadsheet, and every README number is traceable.
- The retrieval half runs cheaply and often; the generation half costs a few cents per run and
  runs deliberately.
- LLM-as-judge is itself a source of error. Keep the rubric in version control and treat judge
  disagreement as a signal to inspect, not a number to average away.
- Labelling ~30 questions with their answer-bearing chunks is real manual work and it is the
  single most valuable hour in the project. Do it before optimising anything.
