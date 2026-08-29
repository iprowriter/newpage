# 0012. Structure-aware chunking, size-bounded, with heading breadcrumbs

**Status:** Accepted
**Date:** 2026-08-29

## Context

Open question 3. The brief names chunking explicitly, so this needs a reason and ideally a
number rather than a value copied from a tutorial.

## Options considered

**Fixed-size character windows.** Trivial, and wrong for documents with structure — it cuts
mid-sentence and mid-table, and a chunk that starts halfway through a clause embeds badly.

**Recursive character splitting.** The common default. Better, but it treats structure as a list
of separators to fall back through rather than as information worth keeping.

**Structure-aware, size-bounded.** Parse to a tree of headings, paragraphs and lists, then pack
contiguous blocks up to a token budget without crossing a heading boundary unless a single
section exceeds the budget.

## Decision

Structure-aware, size-bounded.

- **Token budget, not character count.** The constraint being managed is a context budget, so it
  should be measured in the unit actually being spent.
- **Never split across a heading boundary** unless forced. A section is a semantic unit and the
  author already did the segmentation work.
- **Overlap of one or two sentences** at paragraph granularity, not a blind character window.
- **Every chunk carries** `doc_id`, `collection_id`, page number, heading path, character offsets
  and chunk index. The offsets are captured at ingest even though the highlight viewer is Tier 2 —
  they're cheap to store now and expensive to backfill.

**Prepend the heading breadcrumb to the embedded text.** "Doc title › Section › Subsection" in
front of the chunk body. A chunk embedded in isolation has lost the context that made it
meaningful; the breadcrumb restores most of it at near-zero cost. It's a cheap approximation of
contextual retrieval, and it costs a few tokens per chunk rather than an LLM call per chunk.

**Do not pick a size — measure two.** Roughly 350 vs 800 tokens, run the eval set against both,
report the delta. Including, honestly, if it turns out to make little difference.

## Consequences

- Chunking quality is now bounded by parse quality, which pushes weight onto open question 10
  (supported formats). A document whose structure doesn't survive extraction degrades to
  paragraph packing. That's an acceptable floor, and it should be stated rather than hidden.
- The breadcrumb is inside the embedded text but should not be inside the text shown to the user
  as a citation. Two representations per chunk — embed text and display text. Easy to get subtly
  wrong; worth a test.
- Storing character offsets at ingest is what makes the Tier 2 highlight feature reachable later
  without reindexing.
- Deferred, and the best-ratio upgrade if time allows: small-to-big. Embed the small chunk,
  hand the generator the surrounding parent section. Precision on retrieval, context on
  generation, and nearly free given the metadata above.
