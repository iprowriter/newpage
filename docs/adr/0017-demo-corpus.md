# 0017. Demo corpus: FDA guidance documents, split into department collections

**Status:** Accepted
**Date:** 2026-08-29

## Context

Open question 8, and the last one that gates `specs.md`. The eval set (ADR-0015), the chunk-size
comparison (ADR-0012), the isolation test and every screenshot depend on it.

Requirements: licence-clean for a public repo, structurally rich enough that structure-aware
chunking has something to work with, spanning at least two collections whose separation is
*meaningful*, and something I can write genuinely unanswerable questions about.

## Options considered

**FDA guidance documents.** Works of US federal government employees are not subject to domestic
copyright (17 U.S.C. § 105). FDA states its materials are public domain and may be republished
freely, with credit appreciated but not required; openFDA is explicitly CC0.

**ClinicalTrials.gov protocol PDFs.** Tempting — real protocols, real structure. **Rejected on
licensing:** the registry data is NLM-published, but the attached protocol, SAP and consent-form
PDFs are uploaded by study sponsors. They're third-party works, not government works. FDA's own
terms carry the same caveat for sponsor-submitted material. Public availability is not a licence
to redistribute.

**WHO publications.** Usually CC BY-NC-SA 3.0 IGO. The non-commercial clause is an awkward thing
to attach to a repo I'm handing to a company. Skip.

**EMA documents.** Reuse permitted with acknowledgement, but the terms are fussier and it buys
nothing over FDA.

**PubMed Central open-access subset.** Licences vary per article, so licence verification becomes
per-document work. Not worth it when a single-source alternative exists.

## Decision

**FDA-authored guidance documents only.** One source, one licence, one line in the README.

Split into collections that read as departments (ADR-0002):

| Collection | Content |
|---|---|
| **Clinical Operations** | Trial conduct, informed consent, data integrity, GCP |
| **Manufacturing Quality** | GMP, process validation, sterile products, CMC |

**The overlap is the point.** These two domains share vocabulary heavily — *validation*,
*quality*, *documentation*, *records*, *deviation*, *audit trail* — while the correct answers
differ. That makes the isolation test meaningful: a naive implementation genuinely leaks, and the
test catches something real. Two unrelated corpora would pass isolation trivially and prove
nothing.

Roughly 10–20 documents per collection.

## Why these documents suit the design

- **Clean heading hierarchies.** Numbered sections, tables of contents, consistent structure —
  exactly what ADR-0012's structure-aware chunking is built to exploit, and a fair test of it.
- **Regulatory register.** They say "adequate and well-controlled", "shall", "should"; a user asks
  in plain English. That vocabulary gap is a real semantic-vs-keyword problem, which motivates
  the hybrid retrieval comparison in Tier 2 rather than it being a gratuitous feature.
- **The model already knows this domain.** Gemini has plenty of FDA knowledge in weights, so
  "answer only from retrieved context" is genuinely tested rather than trivially satisfied by
  ignorance. Good for the refusal metric.

## The unanswerable set (ADR-0015 negative cases)

Five categories, roughly ten questions:

1. **In-domain, out-of-corpus** — e.g. veterinary drug labelling. Plausible, absent, and the
   model knows enough to be tempted.
2. **Out-of-collection** — a question answerable in Manufacturing Quality, asked while scoped to
   Clinical Operations. Tests isolation and refusal in one shot; the most valuable category and
   specific to this design.
3. **False premise** — "what does Section 12 say about X" when there is no Section 12. Targets
   sycophancy under a leading question, a known weak spot.
4. **Answerable-shaped but unstated** — asks for a specific figure or date the document never gives.
5. **Wrong domain entirely** — one or two, as a floor.

## Consequences

- Licence story is one sentence, and the exclusion of ClinicalTrials.gov PDFs is worth stating in
  the README — noticing that "publicly available" and "redistributable" differ is itself a signal
  for a regulated-industry reviewer.
- Documents get committed to the repo (they're small and public domain), so `docker compose up`
  seeds a working corpus with no download step. Directly protects the cold-start check (Q12).
- Some FDA guidances contain tables that will chunk imperfectly. Acknowledged limitation, not a
  problem to solve — pick a couple of table-heavy ones deliberately so the README's honesty about
  parsing is evidenced rather than asserted.
- Corpus is in English only and single-domain. Multilingual and mixed-domain behaviour is
  untested; say so.

---

## Amendment, 2026-08-30: the corpus is excerpts, not whole documents

Each document is now a **three-page excerpt** of the guidance it is named after, committed in
place of the full PDF. Eight documents, twenty-four pages, 78 chunks, where before there were
eight documents, 291 pages and 778 chunks.

This is an amendment rather than a superseding ADR because the decision above is unchanged: same
source, same licence, same two departments, same overlap argument. Only the extent of each
document is different.

### Why

The cold-start check (open question 12, and the thing a reviewer does first) took **sixteen
minutes**, of which eleven were embedding 291 pages on CPU inside the container. Embeddings run in
a container precisely so `docker compose up` needs nothing installed on the host (ADR-0004), and
CPU is the price of that. Sixteen minutes of apparent silence is not a neutral cost: it reads as a
hang, and the reviewer's first act becomes debugging a system that is working. Cold start is now
about three and a half minutes, with seeding at 100 seconds.

### What was deliberately not done

**Manufacturing Quality was not dropped**, though removing a collection was the first suggestion.
Ingest time scales with pages, not collections, so it would have saved almost nothing while
costing the isolation test its meaning (ADR-0002), the eval set its out-of-collection category,
and `calibrate.mts` its cases. The overlap argument in the Decision above is the whole reason two
collections exist.

**The documents were not replaced with new, shorter ones.** Keeping the same sources keeps the
licence story, the register, the heading structure and the vocabulary overlap exactly as argued
above, and it kept twelve hand-written eval cases pointing at content that still exists.

### How the pages were chosen, including two methods that failed

Pages were selected so that every answerable eval case still has its source. Two earlier attempts
are recorded because both produced a green-looking corpus that was quietly broken:

1. **Matching eval phrases with an off-the-shelf PDF library.** The earliest match for most
   phrases is the **table of contents**, so the first pass kept TOC pages. `e6r3` ingested as
   "TABLE OF CONTENTS i ii APPENDIX B", one chunk. Recall fell to 67%.
2. **Matching with the same library after filtering TOCs.** This exposed the deeper error: the
   selection was verified with a *different extractor* from the one the app uses. Two phrases it
   found produced zero chunks in the application, and one matched a cross-reference ("See pages
   7-8 of FDA's Guidance…") rather than the content. Recall 75%.

The method that worked selects pages with **the application's own `extract()`**, scoring candidate
pages by overlap with the eval question rather than by text density, so the page kept is the one a
reader would call the answer. This is the rule from the `calibrate` skill applied to a different
problem: verify against the real pipeline, never against a convenient stand-in.

### Effect, measured

| | Full documents | Excerpts |
|---|---|---|
| recall@6 | 100% | 100% |
| MRR | 0.714 | **0.875** |
| groundedness | 100% | 100% |
| citations | 75% | **63%** |
| refusal | 100% | 100% |
| false refusal | 0% | 0% |

MRR improved, partly from the smaller corpus and partly because one sloppy eval label was
tightened (below). **Citations regressed**, and that is the honest cost: with 78 chunks, top-6
puts roughly eight per cent of the entire corpus into every prompt, so more loosely relevant
passages reach the model and it attributes less precisely. For the same reason, recall@6 is now a
weaker claim than it was over 778 chunks, and should be read that way.

### Two eval cases changed, and both were already wrong

- `co-ehr-purpose` became `co-ehr-multi-site`. It asked what the guidance was *for*, which only its
  introduction answers, and that page is no longer in the corpus. It was also mislabelled from the
  start: it asked about purpose while expecting a phrase about interoperability, so its question
  terms never pointed at the chunk it graded against. It had been passing for the wrong reason.
- `co-noncompliance` kept its question but had its label tightened from `"oncompliance"`, which
  appears on nine pages of the full document and therefore graded whether the right *file* came
  back rather than the right passage, to the sentence from section 3.12 that actually answers it.

Trimming the corpus did not break these cases so much as stop hiding them.

### Consequences

- A reviewer opening a corpus PDF sees three pages, not a complete FDA guidance. Stated in the
  README so it reads as a decision rather than a truncated download.
- "Roughly 10–20 documents per collection" in the Decision above was never met and is now further
  from true: four per collection. The count was always a sketch; the overlap between the two
  collections is what the corpus is actually for.
- Table-heavy pages are mostly gone, so the honesty about imperfect table parsing is now less
  evidenced by the demo corpus than the Consequences above assume. The limitation is still real
  and still stated in the README.
- Re-trimming is reproducible: the selection depends only on `evals/dataset.ts` and the app's own
  extractor, so a changed eval set can be re-fitted the same way.
