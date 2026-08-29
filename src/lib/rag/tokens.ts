/**
 * Token estimation.
 *
 * Deliberately an estimate rather than a real tokenizer. The candidates were
 * `js-tiktoken` (OpenAI's BPE) or an approximation; neither Gemini nor
 * nomic-embed-text uses OpenAI's vocabulary, so tiktoken would be *precisely
 * wrong* rather than approximately right — a number that looks authoritative and
 * isn't. An honest estimator with a documented ratio is the better trade for a
 * budget that is itself a heuristic.
 *
 * ~4 characters per token for English prose. What the budget actually protects
 * is that chunks stay well inside the embedding model's window (nomic-embed-text
 * handles 8192, so there is a wide margin) and that assembled context fits the
 * generation prompt. Both tolerate a ±20% estimate; neither tolerates a chunk
 * that silently truncates.
 *
 * If chunk sizing ever turns out to matter at the margins, the ADR-0012 eval
 * comparison is the thing that would show it, and swapping this for a real
 * tokenizer is a one-function change.
 */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
