---
name: calibrate
description: Set a numeric threshold in src/lib/rag from measured data instead of intuition, and record the distribution it came from. Use when adding or changing any constant that decides an outcome — a score floor, a confidence band, a top-k, a chunk size — or when a threshold's behaviour is disputed.
---

# Calibrating a threshold

**The rule this enforces: no constant in `src/lib/rag/**` that decides an outcome may be a guess.**
Every one ships with a committed script that produced it, and the distribution goes in the ADR. A
number that appeared because it "felt about right" cannot be defended in the follow-up interview,
which is the whole reason `docs/scope.md` demands numbers.

## Do not calibrate against fixtures you wrote

This is the failure mode, and it has happened here. Test fixtures written while reading the source
text share its vocabulary, so a lexical or embedding score measured against them comes out far
higher than the same score on real content. `attribute()`'s bands were first set from hand-written
fixtures at 0.40–0.50 for a paraphrase; measured against the real corpus the same category ran
0.18–0.51, and most real paraphrases fell *below* the floor those fixtures justified.

Calibrate against passages that came back from `retrieve()` on the live stack. Always.

## The pattern

Copy `scripts/calibrate.mts` — it sets the retrieval refusal floor and is the reference. Then:

1. **Wire the deps block** verbatim from `calibrate.mts` (`qdrant`, `embedding`, `loadChunks`).
   `src/lib/rag` takes plain arguments (ADR-0007), so the script assembles them.
2. **Prefer retrieval-only.** `calibrate.mts` never calls an LLM: it is deterministic, free, runs
   in seconds, and needs no API key, so a reviewer can reproduce it. Only involve the generator if
   the thing being calibrated genuinely depends on generated text.
3. **Name the bands.** One labelled category per row — what should score high, what should score
   low, and the ambiguous middle. The middle is the one that matters; a script with only obvious
   cases proves nothing.
4. **Print raw scores, not post-threshold ones.** If the function under test applies its own floor,
   export the pre-threshold ranking for the script (`rankPassages` in `attribute.ts` exists for
   exactly this). A calibration that only sees scores which already passed cannot tell a near-miss
   from a total miss — which is the distinction being set.
5. **Print a min/max table per band, and state the verdict in the script.** Have it say
   "SEPARABLE" or "OVERLAP" out loud, so a future run that contradicts the ADR is impossible to
   miss.
6. **Add it to `package.json`** as `calibrate:<thing>`, and cite it by name in the ADR.

## Check your probe before you believe it

A calibration script is code and can be wrong in ways that flatter the feature. Both of these were
shipped in the first version of `calibrate-attribution.mts` and both produced confident nonsense:

- A "synthesis" case built by concatenating two verbatim sentences is not synthesis — it contains a
  verbatim match, and scored 0.99. Hand-write the ambiguous cases.
- Recording `0` for a declined result collapses "scored 0.32 and just missed" into "scored nothing",
  and the band table then shows a separation that does not exist.

If a band comes out perfectly separated on the first run, suspect the probe before believing the
result.

## Then

Put the table in the ADR, with the date and the script name. If the numbers contradict what the
ADR already claims, the numbers win — correct the ADR and say where the old figures came from.
