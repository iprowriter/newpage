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
