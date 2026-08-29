# 0003. Pluggable LLM provider, with host-native Ollama

**Status:** Accepted
**Date:** 2026-08-29

## Context

I want the reviewer to be able to run this with no API key and no account — clone, compose up,
ask questions. Ollama makes that possible. For a life-sciences audience it's also more than
convenience: "no document leaves the machine" is the direct answer to a pharma client that can't
send documents to a third-party API, and that's a story worth telling in the README.

The problem: **Docker Desktop on macOS does not pass the GPU through to containers.** A
generation model running inside the container on a reviewer's MacBook is CPU-only. That's
potentially 60–90 seconds per answer, and slow is the impression the submission makes.

Second problem: small local models are measurably worse at grounded citation and at refusing
when context is weak — the two behaviours this whole submission rests on.

## Options considered

**Local only, model inside the container.** Cleanest privacy story, zero setup. Risks a demo
that crawls on the reviewer's laptop and a multi-gigabyte image.

**Hosted API only.** Fast and good, but requires the reviewer to have a key, and throws away the
data-residency angle that fits their vertical.

**Pluggable provider interface, two adapters.** An interface with an Ollama adapter and a hosted
adapter, selected by environment variable.

## Decision

Pluggable provider interface with both adapters.

- The Ollama adapter talks to a **host-native Ollama** via `host.docker.internal` rather than
  bundling a multi-gig model in the image. Keeps the image small and lets the model use the GPU.
- Document both paths in the README with honest expectations about local speed.
- **Run the eval set against both and publish the numbers as a table.** Local vs hosted, on
  grounded citation and refusal rate, with the trade-off stated and a recommendation for when
  I'd choose each.

## Consequences

- The provider seam is itself an engineering-standards point for the README, and makes the LLM
  mockable in tests.
- The comparison table is likely the strongest single section of the submission — it turns the
  local-model weakness into evidence of measurement discipline, which is exactly what the brief
  is probing for. Very few submissions will have numbers at all.
- Cost: one more abstraction, plus the setup instructions have a branch in them. Worth it.
- Depends on open question 5 (which local model, which hosted one).
