# 0005. Voice input is out of scope

**Status:** Accepted
**Date:** 2026-08-29

## Context

I wanted voice querying. Checked it against the brief: voice-to-transcript is listed as an
optional bonus under **Option 3** (meeting intelligence), not Option 1. It earns nothing on the
criteria I'm actually being graded against.

The brief is also unusually direct about scope: *"we value a solid & well-engineered basic
solution A LOT MORE than an over-engineered complex one"*, and *"Not enough time to implement
everything? That's okay! Document what you'd add next."*

## Options considered

**Local Whisper in a container.** Consistent with the local-first story, but it's another
multi-gigabyte model and more compose surface, competing for time with the eval harness and
observability — the things that are actually graded.

**Browser Web Speech API.** Effectively free, no infrastructure, roughly twenty lines.

**Don't build it.** Put it in "what I'd add next" with the reasoning.

## Decision

Out of scope. It goes in the next-steps section of the README.

If, and only if, everything in Tier 0 and Tier 1 of `docs/scope.md` is finished with time to
spare, the Web Speech API version is allowed. Local Whisper is not, at any point.

## Consequences

- Time goes to citations, refusal, evals and traces instead.
- Being able to explain *why* I cut a feature I wanted is itself a signal — the brief asks for
  trade-offs made within realistic time constraints, and this is one.
