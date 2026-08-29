import { splitSentences } from "./sentences";
import { estimateTokens } from "./tokens";
import type { Block, ChunkOptions, ExtractedDocument, ProducedChunk } from "./types";

/**
 * Structure-aware, token-bounded chunking (ADR-0012).
 *
 * Two properties are load-bearing and everything else follows from them:
 *
 * 1. **A chunk never crosses a heading boundary** unless a single section
 *    exceeds the budget. The author already did the semantic segmentation; a
 *    fixed window throws that away and then pays an LLM to guess it back.
 *
 * 2. **`displayText` is an exact slice of the source text**, never a re-join of
 *    block strings. That is what keeps `charStart`/`charEnd` truthful, which is
 *    what will make citation highlighting correct when the viewer lands. A
 *    reassembled string drifts from the original by whatever whitespace the
 *    joiner invented, and the drift is invisible until a highlight lands two
 *    words off.
 *
 * Overlap is carried only *within* a section. Carrying sentences across a
 * heading would blur exactly the boundary rule (1) exists to preserve.
 */

interface Unit {
  charStart: number;
  charEnd: number;
  page?: number;
  isHeading: boolean;
}

export function chunkDocument(
  doc: ExtractedDocument,
  options: ChunkOptions,
): ProducedChunk[] {
  const chunks: ProducedChunk[] = [];
  const headingStack: { level: number; text: string }[] = [];

  let current: Unit[] = [];
  let currentPath: string[] = [];

  const flush = () => {
    if (current.length === 0) return;
    // A chunk that is nothing but its heading carries no information; fold it
    // into whatever comes next rather than emitting an empty retrieval result.
    if (current.length === 1 && current[0].isHeading) return;

    const charStart = current[0].charStart;
    const charEnd = current[current.length - 1].charEnd;
    const displayText = doc.text.slice(charStart, charEnd).trim();
    if (displayText.length === 0) {
      current = [];
      return;
    }

    chunks.push({
      chunkIndex: chunks.length,
      page: current[0].page,
      headingPath: [...currentPath],
      displayText,
      embedText: buildEmbedText(options.docTitle, currentPath, displayText),
      charStart,
      charEnd,
      tokenCount: estimateTokens(displayText),
    });
    current = [];
  };

  for (const block of doc.blocks) {
    if (block.kind === "heading") {
      flush();
      pushHeading(headingStack, block);
      currentPath = headingStack.map((h) => h.text);
      current = [toUnit(block, true)];
      continue;
    }

    for (const unit of splitOversized(block, doc.text, options.chunkTokens)) {
      const wouldBe = current.length > 0 ? spanTokens(doc.text, current[0].charStart, unit.charEnd) : 0;

      if (current.length > 0 && wouldBe > options.chunkTokens) {
        const previous = current;
        flush();
        current = carryOverlap(doc.text, previous, options);
      }
      current.push(unit);
    }
  }

  flush();
  return chunks;
}

/**
 * The breadcrumb goes into the embedded text only — never into `displayText`.
 * `chunk.test.ts` asserts on this directly because the two representations
 * diverging silently is the failure mode: retrieval quality quietly drops if the
 * breadcrumb is missing, and citations quietly grow a prefix the source does not
 * contain if it leaks the other way.
 */
function buildEmbedText(docTitle: string, headingPath: string[], body: string): string {
  const breadcrumb = [docTitle, ...headingPath].filter(Boolean).join(" > ");
  return breadcrumb ? `${breadcrumb}\n\n${body}` : body;
}

function pushHeading(stack: { level: number; text: string }[], block: Block): void {
  const level = block.level ?? 1;
  while (stack.length > 0 && stack[stack.length - 1].level >= level) {
    stack.pop();
  }
  stack.push({ level, text: block.text.trim() });
}

function toUnit(block: Block, isHeading: boolean): Unit {
  return { charStart: block.charStart, charEnd: block.charEnd, page: block.page, isHeading };
}

function spanTokens(text: string, start: number, end: number): number {
  return estimateTokens(text.slice(start, end));
}

/**
 * A block larger than the whole budget is split at sentence boundaries. Only
 * reached by pathological input — a section with no paragraph breaks — but
 * without it such a block would produce one chunk that never fits a prompt.
 */
function splitOversized(block: Block, text: string, chunkTokens: number): Unit[] {
  const unit = toUnit(block, false);
  if (spanTokens(text, unit.charStart, unit.charEnd) <= chunkTokens) return [unit];

  const body = text.slice(block.charStart, block.charEnd);
  const sentences = splitSentences(body);
  if (sentences.length <= 1) return [unit];

  const units: Unit[] = [];
  let groupStart = 0;

  for (const sentence of sentences) {
    const groupTokens = estimateTokens(body.slice(groupStart, sentence.end));
    if (groupTokens > chunkTokens && sentence.start > groupStart) {
      units.push({
        charStart: block.charStart + groupStart,
        charEnd: block.charStart + sentence.start,
        page: block.page,
        isHeading: false,
      });
      groupStart = sentence.start;
    }
  }

  units.push({
    charStart: block.charStart + groupStart,
    charEnd: block.charEnd,
    page: block.page,
    isHeading: false,
  });
  return units;
}

/**
 * Trailing sentences of the chunk just flushed, so a section split by budget
 * doesn't sever a thought mid-argument.
 *
 * Skipped when the carried text would take more than half the budget: overlap
 * exists to preserve continuity, and at that size it starts crowding out the new
 * content it was supposed to introduce.
 */
function carryOverlap(text: string, previous: Unit[], options: ChunkOptions): Unit[] {
  if (options.overlapSentences <= 0) return [];

  const spanStart = previous[0].charStart;
  const spanEnd = previous[previous.length - 1].charEnd;
  const sentences = splitSentences(text.slice(spanStart, spanEnd));
  if (sentences.length === 0) return [];

  const carried = sentences.slice(-options.overlapSentences);
  const absoluteStart = spanStart + carried[0].start;

  if (estimateTokens(text.slice(absoluteStart, spanEnd)) > options.chunkTokens / 2) return [];

  return [{
    charStart: absoluteStart,
    charEnd: spanEnd,
    page: previous[previous.length - 1].page,
    isHeading: false,
  }];
}
