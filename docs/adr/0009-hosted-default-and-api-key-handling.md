# 0009. Gemini is the documented default; no key ever ships in the repo

**Status:** Accepted
**Date:** 2026-08-29
**Refines:** [ADR-0003](0003-pluggable-llm-provider.md)

## Context

ADR-0003 established a pluggable provider with Ollama and hosted adapters, and left the default
open. Two things force the decision now.

**Local generation is slow where it matters most — first impressions.** Docker Desktop on macOS
doesn't pass the GPU to containers. A reviewer running a local model gets tens of seconds per
answer, and slow is the impression the submission makes.

**Distributing a key is a judgement test.** The temptation is to ship a budget-capped key so the
reviewer has zero setup.

## Decision

**Gemini is the documented default path. Ollama is the local/privacy path. No API key is
committed to the repo, in any form, at any budget cap.**

- `.env.example` carries a placeholder and a link to get a key.
- The README states plainly that Gemini has a free tier — the reviewer needs their own Google
  account and about two minutes, not my key.
- If zero-setup matters, a key goes in the submission email, out of band. Never in git history.
- A small budget cap stays on my own key for eval runs, as runaway-loop insurance.

## Why not ship a capped key

A committed key gets found by GitHub secret scanning and auto-revoked, so it fails at the one job
it had — the reviewer clones a repo with a dead key in it. Worse, an engineer assessing me sees a
credential in version control. A €5 cap limits the financial damage, not the signal. The brief
asks about engineering standards; this is one, and it's the kind that's noticed by its absence.

## Consequences

- The slow-first-run risk disappears. The reviewer's default experience is fast and good.
- ADR-0003's local/hosted eval comparison survives intact and gets *more* interesting — the
  hosted path is now the baseline and Ollama is the "what does privacy cost you in quality"
  column, which is the more useful framing for a regulated-industry audience.
- Setup instructions have a branch. Keep the default path to a handful of lines and put the
  Ollama path below it, rather than presenting two equal options and making the reviewer choose.
- Gemini's free tier has rate limits. Fine for a demo and for ~25 eval questions; note it so a
  reviewer hitting a 429 knows what happened rather than assuming the app is broken.
