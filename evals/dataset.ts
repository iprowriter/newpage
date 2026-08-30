/**
 * The eval set (ADR-0015).
 *
 * Written from the source documents before looking at chunk boundaries. Reading
 * your own chunks and writing questions about them flatters your own retrieval:
 * you end up asking exactly what the retriever is already good at.
 *
 * **Labels are text snippets, not chunk ids.** Two reasons, and the second is
 * the important one:
 *   1. Chunk ids are per-install UUIDs, so hardcoded ones would break on any
 *      re-ingest.
 *   2. This harness exists partly to compare chunk sizes (ADR-0012). Any label
 *      tied to a chunk is invalidated the moment chunking changes — which is the
 *      one experiment it must survive. A snippet is chunking-independent by
 *      construction.
 *
 * A retrieval hit therefore means: some retrieved chunk came from the expected
 * file and contained one of the expected phrases.
 */

export type EvalKind =
  | "answerable"
  | "out_of_collection"
  | "out_of_corpus"
  | "false_premise"
  | "unstated"
  | "off_domain";

export interface EvalCase {
  id: string;
  collection: "Clinical Operations" | "Manufacturing Quality";
  question: string;
  kind: EvalKind;
  /** Answerable cases only. Retrieval succeeds if a hit matches file + one phrase. */
  expect?: { file: string; contains: string[] };
  /** Deterministic floor under the judge — asserted on the answer text directly. */
  answerMustContain?: string[];
  /** Why this case is here, when it is not obvious. */
  note?: string;
}

export const CASES: EvalCase[] = [
  // ---- Manufacturing Quality · answerable ---------------------------------
  {
    id: "mq-stages",
    collection: "Manufacturing Quality",
    question: "What are the three stages of process validation?",
    kind: "answerable",
    expect: { file: "process-validation.pdf", contains: ["Stage 2 – Process Qualification"] },
    answerMustContain: ["Process Design", "Process Qualification"],
  },
  {
    id: "mq-audit-trail",
    collection: "Manufacturing Quality",
    question: "What does audit trail mean for the purposes of the data integrity guidance?",
    kind: "answerable",
    expect: { file: "data-integrity-cgmp-qa.pdf", contains: ["audit trail means a secure, computer-generated"] },
    answerMustContain: ["time-stamped"],
  },
  {
    id: "mq-quality-unit",
    collection: "Manufacturing Quality",
    question: "Does the quality unit have to be a separate department?",
    kind: "answerable",
    expect: { file: "q7-gmp-active-pharmaceutical-ingredients.pdf", contains: ["quality unit can be in the form of separate QA"] },
    note: "Vocabulary mismatch: the source says 'in the form of separate QA and QC units or a single individual', never 'department'.",
  },
  {
    id: "mq-legacy",
    collection: "Manufacturing Quality",
    question: "What counts as a legacy system under Part 11?",
    kind: "answerable",
    expect: { file: "part-11-electronic-records.pdf", contains: ["before August 20, 1997"] },
    answerMustContain: ["1997"],
  },
  {
    id: "mq-narrow-scope",
    collection: "Manufacturing Quality",
    question: "Why does the agency favour a narrow interpretation of Part 11?",
    kind: "answerable",
    expect: { file: "part-11-electronic-records.pdf", contains: ["unnecessary controls"] },
  },
  {
    id: "mq-validation-approach",
    collection: "Manufacturing Quality",
    question: "How should a firm decide how much validation an electronic system needs?",
    kind: "answerable",
    expect: { file: "part-11-electronic-records.pdf", contains: ["justified and documented"] },
    note: "Spans two sections: the risk-based approach and the validation discussion.",
  },

  // ---- Clinical Operations · answerable -----------------------------------
  {
    id: "co-exculpatory",
    collection: "Clinical Operations",
    question: "Can a consent form ask a subject to waive their legal rights?",
    kind: "answerable",
    expect: { file: "informed-consent-irbs-investigators-sponsors.pdf", contains: ["exculpatory language"] },
    answerMustContain: ["exculpatory"],
    note: "Vocabulary mismatch: a reader asks about 'waiving rights'; the source calls it exculpatory language.",
  },
  {
    id: "co-data-originator",
    collection: "Clinical Operations",
    question: "Who can be an authorised data originator in a clinical investigation?",
    kind: "answerable",
    expect: { file: "electronic-source-data-clinical-investigations.pdf", contains: ["Examples of data originators"] },
  },
  {
    id: "co-ehr-multi-site",
    collection: "Clinical Operations",
    question: "Can data from another health care institution's EHR system be sent to the sponsor?",
    kind: "answerable",
    expect: {
      file: "electronic-health-record-data-clinical-investigations.pdf",
      contains: ["data sharing agreements are in place"],
    },
    answerMustContain: ["data sharing agreement"],
    note:
      "Replaces co-ehr-purpose, which asked what the guidance was *for*. That question was " +
      "answered only by the document's introduction, which the corpus no longer carries " +
      "(ADR-0017: documents are excerpts). It was also mislabelled from the start — it asked " +
      "about purpose while expecting a phrase about interoperability, so its question terms " +
      "never pointed at the chunk it was grading against, and it passed on the full corpus " +
      "for the wrong reason. This one asks a single fact stated plainly in section D.",
  },
  {
    id: "co-consent-documented",
    collection: "Clinical Operations",
    question: "Must informed consent be documented in writing?",
    kind: "answerable",
    expect: { file: "informed-consent-irbs-investigators-sponsors.pdf", contains: ["Requirement for Written Documentation"] },
  },
  {
    id: "co-gcp-computerised",
    collection: "Clinical Operations",
    question: "What does good clinical practice expect of computerised systems used in a trial?",
    kind: "answerable",
    // US spelling on purpose: the source says "Computerized". The question keeps
    // the British form, which makes this a vocabulary-mismatch case as well —
    // but the *label* has to match the document, and getting that wrong is how
    // an eval reports a retrieval failure that never happened. It did, once.
    expect: { file: "e6r3-good-clinical-practice.pdf", contains: ["computerized systems"] },
  },
  {
    id: "co-noncompliance",
    collection: "Clinical Operations",
    question: "What should a sponsor do about noncompliance with the protocol?",
    kind: "answerable",
    expect: {
      file: "e6r3-good-clinical-practice.pdf",
      // Was just "oncompliance", which appears on nine pages of the full
      // document — that graded whether the right *file* came back, not the right
      // passage, so it could pass on a chunk that merely mentions the word. This
      // is the sentence from section 3.12 that actually answers the question.
      contains: ["appropriate and proportionate action by the sponsor to secure compliance"],
    },
  },

  // ---- Negative: answerable, but in the OTHER collection -------------------
  // The most valuable category, and specific to this design: it tests isolation
  // and refusal in one shot (ADR-0017). Each of these is a question the system
  // answers correctly when asked in its own collection.
  {
    id: "neg-xcol-stages",
    collection: "Clinical Operations",
    question: "What are the three stages of process validation?",
    kind: "out_of_collection",
  },
  {
    id: "neg-xcol-audit-trail",
    collection: "Clinical Operations",
    question: "What does audit trail mean for the purposes of the data integrity guidance?",
    kind: "out_of_collection",
  },
  {
    id: "neg-xcol-consent",
    collection: "Manufacturing Quality",
    question: "Can a consent form ask a subject to waive their legal rights?",
    kind: "out_of_collection",
  },
  {
    id: "neg-xcol-originator",
    collection: "Manufacturing Quality",
    question: "Who can be an authorised data originator in a clinical investigation?",
    kind: "out_of_collection",
  },

  // ---- Negative: in-domain, absent from the corpus -------------------------
  // Plausible, adjacent, and the model knows plenty about them from training —
  // which is precisely what makes them a real test of "answer only from context".
  {
    id: "neg-corpus-veterinary",
    collection: "Clinical Operations",
    question: "What are the labelling requirements for veterinary drugs?",
    kind: "out_of_corpus",
  },
  {
    id: "neg-corpus-device-cyber",
    collection: "Manufacturing Quality",
    question: "How should cybersecurity risk in medical devices be assessed premarket?",
    kind: "out_of_corpus",
  },
  {
    id: "neg-corpus-orphan",
    collection: "Clinical Operations",
    question: "What are the criteria for orphan drug designation?",
    kind: "out_of_corpus",
  },

  // ---- Negative: false premise --------------------------------------------
  // Targets sycophancy. A leading question invites the model to play along, and
  // playing along here means inventing a section that does not exist.
  {
    id: "neg-premise-section42",
    collection: "Clinical Operations",
    question: "What does Section 42 say about reimbursing trial participants in cryptocurrency?",
    kind: "false_premise",
  },
  {
    id: "neg-premise-annex",
    collection: "Manufacturing Quality",
    question: "Summarise Annex 7's requirements for continuous manufacturing of biologics.",
    kind: "false_premise",
  },

  // ---- Negative: answerable-shaped, never stated ---------------------------
  // The hardest category. Retrieval returns exactly the right passage; the
  // passage simply does not contain the figure. No similarity score can see
  // this — only a reader can.
  {
    id: "neg-unstated-retention-years",
    collection: "Manufacturing Quality",
    question: "How many years exactly must electronic records be retained under Part 11?",
    kind: "unstated",
  },
  {
    id: "neg-unstated-batch-count",
    collection: "Manufacturing Quality",
    question: "How many validation batches does FDA require for process qualification?",
    kind: "unstated",
    note: "The guidance explicitly declines to set a number. A confident figure here is a fabrication.",
  },
  {
    id: "neg-unstated-consent-reading-age",
    collection: "Clinical Operations",
    question: "What reading age must a consent form be written at?",
    kind: "unstated",
  },

  // ---- Negative: wrong domain entirely ------------------------------------
  { id: "neg-off-paris", collection: "Clinical Operations", question: "What is the capital of France?", kind: "off_domain" },
  { id: "neg-off-sourdough", collection: "Manufacturing Quality", question: "How do I make a sourdough starter?", kind: "off_domain" },
];

export const ANSWERABLE = CASES.filter((c) => c.kind === "answerable");
export const NEGATIVE = CASES.filter((c) => c.kind !== "answerable");
