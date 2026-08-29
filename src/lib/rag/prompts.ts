import type { RetrievedChunk } from "./types";

/**
 * Prompts and context assembly.
 *
 * Kept in one file on purpose: prompt wording is a decision the brief asks about,
 * and decisions scattered across call sites cannot be reviewed, diffed, or
 * reasoned about as a set.
 */

/**
 * Two independent insufficiency signals, because they catch different failures:
 *
 * - The retrieval score threshold catches *nothing relevant was found*.
 * - `sufficient: false` catches *something was found and it does not answer the
 *   question* — a passage about the right topic that never states the fact asked
 *   for. Similarity cannot see that; only a reader can.
 *
 * A system with only the first confidently answers from adjacent material, which
 * is the exact failure mode that matters most for a regulated audience.
 */
export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    sufficient: {
      type: "boolean",
      description: "Whether the sources actually contain the answer to the question.",
    },
    answer: {
      type: "string",
      description: "The answer, grounded only in the sources. Empty when sufficient is false.",
    },
    missing: {
      type: "string",
      description: "When sufficient is false, what the sources do not say. Empty otherwise.",
    },
    citations: {
      type: "array",
      description: "Source numbers actually used, as shown in the context.",
      items: { type: "integer" },
    },
    followUps: {
      type: "array",
      description: "Two further questions answerable from these same sources.",
      items: { type: "string" },
    },
  },
  required: ["sufficient", "answer", "missing", "citations", "followUps"],
} as const;

export const ANSWER_SYSTEM = `You answer questions about a specific set of documents.

Rules, in order of priority:

1. Use ONLY the numbered sources provided. You have background knowledge about this subject; do not use it. If the sources do not contain the answer, say so — that is a correct outcome, not a failure.
2. Set "sufficient" to false when the sources do not answer the question, even if they discuss the same topic. A passage about the right subject that never states the fact asked for is not an answer.
3. Cite the source numbers you actually used in "citations". Never cite a source you did not draw from.
4. If the question assumes something the sources contradict or never establish — a section that does not exist, a requirement that is not there — say that plainly instead of playing along.
5. Quote the documents' own terms where precision matters. This is regulatory text and paraphrase loses meaning.
6. Propose exactly two "followUps" that these same sources can answer. Base them on what the sources contain, not on what the topic suggests.

Be direct. No preamble, no restating the question.`;

/**
 * Follow-ups are requested here, in the same call, rather than from a second
 * round-trip against the answer (ADR-0019). Two reasons: a second call roughly
 * doubles perceived latency, which hurts most on the local path where it is
 * already slowest; and follow-ups derived from an *answer* drift toward material
 * the corpus does not hold, so the demo generates refusals and correct behaviour
 * reads as breakage.
 */
export function buildAnswerPrompt(question: string, chunks: RetrievedChunk[]): string {
  const sources = chunks
    .map((chunk, i) => {
      const location = [chunk.filename, chunk.page ? `page ${chunk.page}` : null]
        .filter(Boolean)
        .join(", ");
      const section = chunk.headingPath.join(" > ");
      return `[${i + 1}] ${location}${section ? `\nSection: ${section}` : ""}\n${chunk.displayText}`;
    })
    .join("\n\n---\n\n");

  return `Question: ${question}\n\nSources:\n\n${sources}`;
}

export const REWRITE_SYSTEM = `Rewrite the user's question as a search query that would match the wording of formal regulatory guidance documents.

Use the vocabulary those documents use rather than the vocabulary a person would use. Keep it to one line. Output only the rewritten query, nothing else.`;

export function buildRewritePrompt(question: string): string {
  return `Question: ${question}`;
}
