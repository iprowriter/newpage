/**
 * Sentence boundaries, for overlap and for splitting oversized blocks.
 *
 * A regex, not an NLP library. It handles the case that matters here — regulatory
 * prose in complete sentences — and fails predictably on the cases it doesn't:
 * abbreviations ("U.S. Food and Drug"), decimals inside numbered lists, and
 * citations. Those produce a slightly-off split point, never data loss, because
 * every consumer works in offsets over the original text.
 *
 * Guarding a handful of known abbreviations covers most of the damage on FDA
 * documents specifically (ADR-0017), which is where this actually runs.
 */

const ABBREVIATIONS = [
  "U.S", "e.g", "i.e", "etc", "vs", "cf", "Dr", "Mr", "Mrs", "Ms", "Inc", "Ltd",
  "Fig", "No", "Sec", "approx", "min", "max",
];

export interface Sentence {
  text: string;
  /** Offset relative to the start of the input string. */
  start: number;
  end: number;
}

export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;

  // A boundary is .!? followed by whitespace and something that starts a new
  // sentence. Trailing quotes/brackets are allowed to close before the space.
  const boundary = /[.!?]["')\]]?\s+/g;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const candidate = text.slice(start, end);

    if (endsWithAbbreviation(candidate)) continue;

    sentences.push({ text: candidate, start, end });
    start = end;
  }

  if (start < text.length) {
    sentences.push({ text: text.slice(start), start, end: text.length });
  }

  return sentences;
}

function endsWithAbbreviation(candidate: string): boolean {
  const trimmed = candidate.trimEnd();
  if (!trimmed.endsWith(".")) return false;
  const lastWord = trimmed.slice(0, -1).split(/[\s(]/).pop() ?? "";
  return ABBREVIATIONS.includes(lastWord);
}
