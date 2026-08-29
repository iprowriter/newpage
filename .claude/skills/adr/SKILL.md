---
name: adr
description: Write and index an architecture decision record in docs/adr. Use when a technical decision is made, reversed, or superseded — including a decision to NOT do something, and including a negative result where the intended approach did not work.
---

# Writing an ADR

`docs/adr/` is where the submission README comes from. The brief asks for "key technical decisions
and why" and "choices considered and final choice", so an unrecorded decision is work that cannot
be graded. Write the ADR when the decision is made, not at the end — reconstructed reasoning reads
as reconstructed.

## Steps

1. **Read the neighbours first.** The two or three most recent ADRs, plus any this one touches.
   Decisions are immutable once accepted: if you are changing one, you are writing a *new* ADR that
   supersedes it, never editing the old file.
2. **Take the next number.** `ls docs/adr/` — highest plus one. Filename is
   `NNNN-kebab-case-title.md`.
3. **Follow `docs/adr/TEMPLATE.md`**: Context, Options considered, Decision, Consequences. Status
   is `Accepted` unless it genuinely is not. Date it.
4. **Add the index row** to the table in `docs/adr/README.md`. This is the step that gets forgotten
   — an ADR missing from the table is invisible.
5. **If it supersedes one**, set the old file's status to `Superseded by ADR-NNNN` (the one edit
   permitted to an accepted ADR) and update both index rows.
6. **If it resolves a `docs/scope.md` tier item**, annotate that item with what shipped and how it
   differs from what was planned.

## What makes these worth reading

- **Options considered must be real.** Each with the actual trade-off and why it lost. A strawman
  list is worse than no list — it advertises that the decision was made first and justified after.
- **Record negative results.** An approach that was tried and did not work is the most valuable
  thing in the directory, because nobody can fake having tried it. ADR-0024 exists mostly to record
  that lexical matching *cannot* distinguish a paraphrase from a synthesised claim, which was the
  property the feature was built for.
- **Consequences names what it makes hard**, not only what it makes easy, plus the cost knowingly
  accepted. An ADR with no downside section has not been thought about.
- **Numbers, if the decision rests on any**, with the script that produced them named — see the
  `calibrate` skill.

## House style

British spelling. Comments and prose explain *why*, especially where the obvious choice was
rejected. No emoji. Plain sentences; the reader is an engineer deciding whether to trust the
system, not a customer being sold one.
