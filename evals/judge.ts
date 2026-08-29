import type { Provider } from "@/lib/rag/providers/types";

/**
 * LLM-as-judge for the half of quality no assertion can reach.
 *
 * Its scope is deliberately narrow. The judge is *not* asked whether the answer
 * is correct — it has no more access to the truth than the system under test.
 * It is asked one mechanical question: is every claim in this answer supported
 * by the sources that were supplied? That is checkable from the text alone, and
 * it is exactly the failure this system is built to prevent.
 *
 * The rubric lives in version control rather than in a prompt string built at
 * run time, because a score is only comparable across runs if the thing that
 * produced it did not quietly change between them.
 *
 * Known limitation, stated rather than averaged away: the judge is itself a
 * model and can be wrong. That is why every answerable case also carries
 * deterministic `answerMustContain` assertions — a floor that holds even when
 * the judge does not.
 */

const SYSTEM = `You are grading whether an answer stayed within its sources.

You will be given a question, the numbered sources that were retrieved, and an answer.

Score groundedness from 0 to 1:
- 1.0 — every factual claim in the answer is supported by the sources.
- 0.5 — mostly supported, but at least one claim goes beyond what the sources say.
- 0.0 — substantially unsupported, or contradicts the sources.

Score citations from 0 to 1:
- 1.0 — every cited source is one the answer actually drew from.
- 0.5 — some citations are decorative or a used source was not cited.
- 0.0 — citations do not correspond to the content at all.

Judge ONLY support, never correctness. If a claim is true in the world but absent
from the sources, that is ungrounded and scores accordingly — that is the whole
point of the check.

An answer that declines to answer, when the sources genuinely do not contain the
answer, is fully grounded. Score it 1.0.

Reply with JSON only.`;

const SCHEMA = {
  type: "object",
  properties: {
    groundedness: { type: "number" },
    citations: { type: "number" },
    reason: { type: "string" },
  },
  required: ["groundedness", "citations", "reason"],
};

export interface Judgement {
  groundedness: number;
  citations: number;
  reason: string;
}

export async function judge(
  question: string,
  sources: { n: number; filename: string; page: number | null; text: string }[],
  answer: string,
  provider: Provider,
): Promise<Judgement | null> {
  const rendered = sources
    .map((s) => `[${s.n}] ${s.filename}${s.page ? `, page ${s.page}` : ""}\n${s.text}`)
    .join("\n\n---\n\n");

  const result = await provider.generate({
    system: SYSTEM,
    user: `Question: ${question}\n\nSources:\n\n${rendered}\n\nAnswer:\n${answer}`,
    schema: SCHEMA,
    temperature: 0,
  });

  try {
    const parsed = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as Judgement;
    if (typeof parsed.groundedness !== "number" || typeof parsed.citations !== "number") return null;
    return parsed;
  } catch {
    // A judge that cannot be parsed is not a zero — it is a missing measurement,
    // and scoring it as failure would silently punish the system under test for
    // the grader's mistake.
    return null;
  }
}
