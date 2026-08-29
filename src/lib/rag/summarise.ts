import type { Provider } from "./providers/types";

/**
 * A short orientation for someone opening a collection they did not build.
 *
 * The obvious approach — feed it the documents — does not survive contact with
 * the corpus: this collection alone is 486 chunks. So the summary is built from
 * *structure* rather than text. Each document contributes its title, its
 * top-level headings, and a handful of excerpts spread across it, which is
 * enough to describe scope accurately and costs one small call regardless of how
 * large the collection grows.
 *
 * The cost of that choice, stated in the prompt and worth stating here: this
 * describes what the collection *covers*, not what it *concludes*. A summary
 * built from headings cannot faithfully report findings it never read, and
 * inviting the model to try is inviting it to invent them.
 */

const SYSTEM = `You write a short orientation for someone who has just opened a collection of documents and does not know what is in it.

You are given each document's title, its section headings, and a few excerpts. That is all you know.

Rules:
- Describe what this collection covers and what kinds of questions it can answer. Do not state findings, conclusions or specific requirements — you have seen headings and fragments, not the documents.
- Ground every claim in the material provided. Never fill gaps from background knowledge of the subject, however confident you are.
- Two short paragraphs at most. No heading, no bullet list, no preamble.
- Name the documents where it helps the reader know where to look.
- Plain, direct prose. Do not sell the collection or describe it as comprehensive.`;

export interface DocumentOutline {
  filename: string;
  headings: string[];
  excerpts: string[];
}

export async function summariseCollection(
  collectionName: string,
  documents: DocumentOutline[],
  provider: Provider,
): Promise<string> {
  const body = documents
    .map((document) => {
      const headings = document.headings.length
        ? `Sections:\n${document.headings.map((h) => `- ${h}`).join("\n")}`
        : "Sections: none detected";
      return `## ${document.filename}\n${headings}\n\nExcerpts:\n${document.excerpts.join("\n\n")}`;
    })
    .join("\n\n---\n\n");

  const result = await provider.generate({
    system: SYSTEM,
    user: `Collection: ${collectionName}\nDocuments: ${documents.length}\n\n${body}`,
    temperature: 0.3,
  });

  return result.text.trim();
}

/**
 * Picks what each document contributes.
 *
 * Excerpts are spread across the document rather than taken from the front,
 * which on a guidance document would return the cover page and the table of
 * contents every time.
 */
export function outlineFrom(
  filename: string,
  chunks: { headingPath: string[]; displayText: string }[],
  { headingLimit = 12, excerptCount = 4 } = {},
): DocumentOutline {
  const headings: string[] = [];
  for (const chunk of chunks) {
    const top = chunk.headingPath[0];
    if (top && !headings.includes(top)) headings.push(top);
    if (headings.length >= headingLimit) break;
  }

  const step = Math.max(1, Math.floor(chunks.length / excerptCount));
  const excerpts = chunks
    .filter((_, index) => index % step === 0)
    .slice(0, excerptCount)
    .map((chunk) => chunk.displayText.replace(/\s+/g, " ").slice(0, 320));

  return { filename, headings, excerpts };
}
