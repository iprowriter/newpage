# 0021. Design system: adopt the PracticeDepth token system, purple accent

**Status:** Accepted
**Date:** 2026-08-29

## Context

The brief grades UI/UX explicitly and expects "a well designed application". Designing a visual
language from scratch under time pressure is how take-homes end up looking like unstyled Tailwind
defaults.

I already have a working, coherent design system in another project (PracticeDepth), built on
semantic CSS variables with a violet accent. It's proven, it's mine, and reusing it puts the time
into the parts of this build that are actually being assessed.

## Decision

Adopt the PracticeDepth token system, adapted.

**Accent — violet.** `#6E56CF` light, `#8B78E8` dark, with `--accent-strong`, `--accent-tint` and
`--accent-on-tint` for hover, badge backgrounds and text-on-tint.

**Every themeable value is a semantic CSS variable** in `globals.css`, mapped into Tailwind via
`@theme inline` so components write `bg-surface`, `text-ink`, `border-line`. **No hardcoded hex in
components** — that is precisely what breaks dark mode, and it's a rule a linter can't easily
catch, so it goes in the contributing notes.

**Theme is an explicit choice, not an OS sniff.** Light is `:root`; dark applies only under
`:root[data-theme="dark"]`. `prefers-color-scheme` is deliberately not consulted, so the toggle is
the single source of truth and a dark-OS reviewer still lands on light first and sees the toggle
work.

**Typography.** Geist sans for everything structural, Geist mono for code, chunk text and trace
values. PracticeDepth's Newsreader serif is dropped — it exists there to signal "a person is
speaking", which has no analogue here.

**Restraint rules, carried over unchanged:** two weights only (400, 500 — no 600/700), sentence
case everywhere, no emoji, hairline `0.5px` borders on `--line`, radius 14–16px cards / 8px inputs
/ 999px pills, accent focus-visible ring, `prefers-reduced-motion` respected.

## Additions for this application

Three semantic states the source system doesn't have, defined as tokens rather than ad-hoc colours:

| Token | Use |
|---|---|
| `--refusal` | The refusal surface (ADR-0019). Uses `--warn`, not `--danger` — a refusal is correct behaviour, not an error, and colouring it red would teach the reviewer the opposite of the point. |
| `--score-high` / `--score-low` | Retrieval score bars in the provenance panel. |
| `--citation` | Citation markers and their highlighted spans. Accent-derived. |

## Consequences

- Visual language is settled before any component is written, so styling decisions don't get
  relitigated mid-build.
- The colour choice for refusal is a deliberate design argument, and worth one line in the README:
  the system distinguishes "I could not find this" from "something went wrong", in the interface as
  well as in the logs.
- Reusing a system from another project is worth stating in the AI-tooling section — it's a real
  answer to "how do you make this repeatable and maintainable" that isn't about prompts.
- Cost: tokens carried over that this app never uses (`--star`, the code-syntax set). Trim on the
  way in rather than shipping dead variables.
