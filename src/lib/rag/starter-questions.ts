import type { Provider } from "./providers/types";

/**
 * Three opening questions, generated at ingest and stored (ADR-0019).
 *
 * Built from **the document's own heading tree and a sample of its chunks** —
 * never from the model's background knowledge of the subject. That distinction
 * is the whole point:
 *
 * - Grounded by construction. A question generated from the topic can ask
 *   something the document never covers, so the first thing a reviewer clicks
 *   produces a refusal and correct behaviour reads as breakage.
 * - It doubles as evidence the chunking worked. If the headings extracted badly,
 *   the suggestions are visibly wrong, on the landing screen, immediately.
 *
 * Generated once because the answer never changes, and a per-page-load LLM call
 * is a visible stall on the local path.
 */

const SYSTEM = `You write opening questions for someone who has just uploaded a document and does not yet know what is in it.

Rules:
- Base every question strictly on the section headings and excerpts provided. Never use background knowledge about the subject.
- Each question must be answerable from this document alone.
- Ask about substance, not structure. "What are the sponsor's monitoring responsibilities?" not "What does section 4 cover?"
- One line each, no numbering, no preamble. Exactly three.`;

const SCHEMA = {
  type: "object",
  properties: {
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["questions"],
};

/**
 * The minimum a chunk has to provide. Structural rather than `ProducedChunk` so
 * this works both at ingest (chunks in memory) and when backfilling documents
 * that were indexed before this step existed (chunks read back from Postgres).
 */
export interface QuestionSource {
  headingPath: string[];
  displayText: string;
}

export async function generateStarterQuestions(
  title: string,
  chunks: QuestionSource[],
  provider: Provider,
): Promise<string[]> {
  const headings = [...new Set(chunks.flatMap((c) => c.headingPath))].slice(0, 40);
  // Spread the excerpts across the document rather than taking the first few,
  // which on a guidance document would be the cover page and table of contents.
  const step = Math.max(1, Math.floor(chunks.length / 6));
  const excerpts = chunks
    .filter((_, i) => i % step === 0)
    .slice(0, 6)
    .map((c) => c.displayText.replace(/\s+/g, " ").slice(0, 300));

  const result = await provider.generate({
    system: SYSTEM,
    user: `Document: ${title}\n\nSection headings:\n${headings.join("\n")}\n\nExcerpts:\n\n${excerpts.join("\n\n---\n\n")}`,
    schema: SCHEMA,
    temperature: 0.4,
  });

  try {
    const parsed = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as {
      questions?: unknown;
    };
    if (!Array.isArray(parsed.questions)) return [];
    return parsed.questions.filter((q): q is string => typeof q === "string" && q.length > 0).slice(0, 3);
  } catch {
    return [];
  }
}
