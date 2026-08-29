/**
 * Which retrieved passage supports this sentence of the answer?
 *
 * The reader highlights a span of the generated answer and asks where it came
 * from. `citations` answers that for the answer as a whole — "sources 1, 3 and
 * 4 were used" — which is not the question being asked. This maps one claim
 * back to one passage, and to a span inside it.
 *
 * **It runs on data the client already has.** `Source.displayText` is an exact
 * slice of the original document and is already in the browser when the answer
 * renders, so this is a pure function over five to eight strings: no second
 * retrieval, no extra embedding call, no added latency, and — because neither
 * the prompt nor the graph changes — no way for it to move an eval number. An
 * attribution feature that could make answers worse would be a bad trade at any
 * quality.
 *
 * **It is lexical, and the UI says so.** Weighted term overlap, not semantics.
 * It finds the passage a claim was drawn from when the wording survived, and
 * degrades when the model paraphrased heavily. Hence "closest supporting
 * passage" rather than "citation".
 *
 * **What it can and cannot tell apart.** Measured on the FDA corpus, three
 * bands, and the honest reading of them shaped the API:
 *
 * - Verbatim or lightly reworded claims score 0.8–1.0, with the runner-up far
 *   behind. Reported as `strong`.
 * - Heavy paraphrase scores 0.40–0.50. So does a claim synthesised from two
 *   passages — and the runner-up margin does not separate them either (0.24 for
 *   a synthesised claim, 0.04–0.11 for genuine paraphrases, i.e. backwards).
 *   Lexical overlap cannot distinguish these, so the code does not pretend to:
 *   both are reported as `partial`, and the UI hedges rather than asserting the
 *   claim was drawn from there.
 * - A claim nothing supports scores 0.0, cleanly separated from both. Below
 *   `MIN_SCORE` this returns null and the reader is told no passage supports the
 *   selection, rather than being handed the least-bad guess.
 *
 * Telling the reader "probably here" when that is all the evidence supports is
 * the same instinct as the refusal surface (ADR-0019). What would be wrong is
 * showing `partial` and `strong` identically.
 */
import { splitSentences } from "./sentences";

export interface AttributionSource {
  n: number;
  chunkId: string;
  /** The exact source slice the reader can already open. */
  displayText: string;
}

export interface Attribution {
  n: number;
  chunkId: string;
  /** Offsets into that source's displayText, for the highlight. */
  start: number;
  end: number;
  /** 0–1. Weighted recall of the selection inside the matched window. */
  score: number;
  /** `strong`: the wording is there. `partial`: overlapping, presented as such. */
  confidence: "strong" | "partial";
}

/** Below this, no passage is offered at all. Measured floor: unsupported claims sit at 0. */
const MIN_SCORE = 0.35;

/** Above this, the wording itself survived and the passage can be named without hedging. */
const STRONG_SCORE = 0.6;

/**
 * A two-word selection cannot be attributed honestly — "the sponsor" appears in
 * every chunk of a regulatory corpus and would match whichever sorted first.
 */
const MIN_SELECTION_TERMS = 3;

/** A claim spans a sentence or two. Wider windows match everything and mean nothing. */
const MAX_WINDOW_SENTENCES = 3;

/** Ties are decided by the shorter span, so a window only grows if it earns it. */
const EPSILON = 1e-9;

/**
 * Function words carry no evidence of provenance, and regulatory prose is dense
 * with them. Deliberately short: domain terms are handled by the frequency
 * weighting below, which adapts to the retrieved set, rather than by a hardcoded
 * list that would not.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can",
  "does", "for", "from", "had", "has", "have", "if", "in", "into", "is", "it",
  "its", "may", "must", "no", "not", "of", "on", "or", "should", "such", "than",
  "that", "the", "their", "them", "then", "there", "these", "they", "this",
  "those", "to", "was", "were", "when", "which", "who", "will", "with", "would",
]);

/**
 * Words, plus the compound forms regulatory text is full of: "21 CFR 312.32",
 * "pre-approval", "180-day". Splitting on that punctuation would discard the
 * most identifying tokens in the document.
 */
const TOKEN = /[a-z0-9]+(?:[.\-/][a-z0-9]+)*/g;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN) ?? []).filter((token) => !STOPWORDS.has(token));
}

function bigrams(tokens: string[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 1) pairs.push(`${tokens[i]} ${tokens[i + 1]}`);
  return pairs;
}

/**
 * Rarity within the retrieved set, not within the corpus.
 *
 * The comparison is only ever between the handful of passages that came back for
 * this question, so that is the right denominator. A term common to all of them
 * — "adverse event", when every retrieved chunk is about adverse events —
 * carries almost no information about *which* one a claim came from, and this
 * says so, whereas a corpus-wide IDF would still rank it highly and let shared
 * boilerplate decide the match. Add-one smoothing keeps a term appearing in none
 * of them finite: it takes the maximum weight and can never be matched, which is
 * the penalty an invented term deserves.
 */
function inverseFrequency(term: string, sourceTokens: Set<string>[]): number {
  const documentFrequency = sourceTokens.reduce((n, tokens) => n + (tokens.has(term) ? 1 : 0), 0);
  return Math.log(1 + sourceTokens.length / (documentFrequency + 1));
}

/**
 * The best-matching window in each passage, strongest first, *before* the floor
 * is applied. Exported for `scripts/calibrate-attribution.mts`: a calibration
 * that could only see scores which already passed the threshold could never tell
 * a near-miss from a total miss, which is the distinction the thresholds are
 * being set on.
 */
export function rankPassages(selection: string, sources: AttributionSource[]): Attribution[] {
  const selectionTokens = tokenize(selection);
  const terms = [...new Set(selectionTokens)];
  if (terms.length < MIN_SELECTION_TERMS) return [];

  const sourceTokens = sources.map((source) => new Set(tokenize(source.displayText)));
  const weights = new Map(terms.map((term) => [term, inverseFrequency(term, sourceTokens)]));
  const totalWeight = terms.reduce((sum, term) => sum + (weights.get(term) ?? 0), 0);
  if (totalWeight === 0) return [];

  const selectionBigrams = [...new Set(bigrams(selectionTokens))];
  const ranked: Attribution[] = [];

  for (const source of sources) {
    const sentences = splitSentences(source.displayText);
    let best: Attribution | null = null;

    for (let i = 0; i < sentences.length; i += 1) {
      for (let j = i; j < Math.min(i + MAX_WINDOW_SENTENCES, sentences.length); j += 1) {
        const window = source.displayText.slice(sentences[i].start, sentences[j].end);
        const windowTokens = tokenize(window);
        const present = new Set(windowTokens);
        const presentPairs = new Set(bigrams(windowTokens));

        const matched = terms.reduce(
          (sum, term) => sum + (present.has(term) ? (weights.get(term) ?? 0) : 0),
          0,
        );
        const unigramRecall = matched / totalWeight;

        // Word order separates "this claim came from this passage" from "both
        // texts are about the same subject", so it gets a real share of the
        // score — but a minority share, because a faithful paraphrase keeps the
        // terms and loses the order, and that still deserves to match.
        const pairRecall =
          selectionBigrams.length === 0
            ? unigramRecall
            : selectionBigrams.filter((pair) => presentPairs.has(pair)).length /
              selectionBigrams.length;

        const score = 0.75 * unigramRecall + 0.25 * pairRecall;
        const span = trim(source.displayText, sentences[i].start, sentences[j].end);

        // Coverage only ever grows as sentences are added, so preferring the
        // shortest window that ties keeps the highlight on the sentence carrying
        // the claim instead of creeping outward to the whole chunk.
        const better =
          best === null ||
          score > best.score + EPSILON ||
          (score > best.score - EPSILON && span.end - span.start < best.end - best.start);

        if (better) {
          best = {
            n: source.n,
            chunkId: source.chunkId,
            ...span,
            score,
            confidence: score >= STRONG_SCORE ? "strong" : "partial",
          };
        }
      }
    }

    if (best) ranked.push(best);
  }

  // Ties break towards the better-retrieved passage, the only ordering
  // information left once the text scores identically.
  return ranked.sort((a, b) => b.score - a.score || a.n - b.n);
}

export function attribute(selection: string, sources: AttributionSource[]): Attribution | null {
  const best = rankPassages(selection, sources)[0];
  return best && best.score >= MIN_SCORE ? best : null;
}

/** Sentence spans carry their trailing whitespace; a highlight should not. */
function trim(text: string, start: number, end: number): { start: number; end: number } {
  let from = start;
  let to = end;
  while (from < to && /\s/.test(text[from])) from += 1;
  while (to > from && /\s/.test(text[to - 1])) to -= 1;
  return { start: from, end: to };
}
