---
name: verify
description: Decide and run the right checks after a change — always the fast gate, plus evals when the change can affect what the model outputs. Use after finishing any feature, fix, or refactor, and before reporting work as done.
---

# Verifying a change

Two gates. The first always runs. The second runs only when the change can move an answer — and
deciding that is the point of this skill, because the eval gate is the one that gets skipped
precisely when it matters.

## Gate 1 — always, before reporting anything as done

```
npm run typecheck      # next typegen && tsc --noEmit
npm run lint           # eslint; the src/lib/rag import ban lives here
npm test               # vitest run — no network, seconds
```

All three, every time. Report the actual result: if something fails, say so with the output.
If a test count is quoted in `README.md` or `AGENTS.md`, update it when it changes — both have
gone stale before.

## Gate 2 — evals, when the change can affect model output

Run the eval gate if the change touches **any** of:

- `src/lib/rag/graph.ts`, `prompts.ts`, `retrieve.ts`, `chunk.ts`, `embed.ts`, `providers/**`
- model ids or `topK` in `src/lib/env.ts` or the collection config
- the corpus, the chunking options, or anything upstream of what gets embedded

```
npm run eval -- --retrieval-only    # deterministic, free, seconds — start here
npm run eval                        # full: LLM-as-judge, costs money and time
npm run eval -- --provider ollama   # the local column, if the change could affect it
```

`--retrieval-only` first: if recall@k and MRR moved, the cause is upstream of generation and the
expensive run can wait until that is understood. Use `--label "<what changed>"` so the stored run
is identifiable later, and record **before and after**, including when the change did not help —
`docs/scope.md` asks for the honest case explicitly.

**A change that introduces or moves a numeric threshold needs the `calibrate` skill, not just an
eval.** Evals score the pipeline; they do not tell you where a constant should sit.

## When Gate 2 does not apply

UI, styling, docs, trace viewer, and attribution/provenance display cannot move an eval number:
they touch neither prompt, graph, nor the answer path. Say so explicitly rather than silently
skipping — `docs/scope.md`'s stop rules make "cannot move an eval number" a claim that has to be
made and defended, not assumed.

## Before calling it done

- Gate 1 clean, and Gate 2 clean or explicitly not applicable with the reason.
- Any figure quoted in docs (test counts, eval scores, chunk counts) still true.
- An ADR written if a decision was made — see the `adr` skill.
- Say plainly what was verified and what was not. A feature whose rendered appearance was never
  looked at has not been visually verified, however green the tests are.
