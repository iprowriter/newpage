import type { Block, ExtractedDocument } from "./types";

/**
 * Plain text and Markdown extraction (ADR-0018).
 *
 * Markdown support exists mainly so tests and fixtures can exercise the real
 * pipeline rather than a hand-built mock — the demo corpus is PDF. That is worth
 * stating plainly rather than implying broad format support.
 *
 * Every block records offsets into the *original* string, unmodified. Nothing
 * downstream reassembles text from block strings, so the offsets stay exact and
 * a citation highlights the source rather than an approximation of it.
 */

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

export function extractText(text: string, isMarkdown: boolean): ExtractedDocument {
  const blocks: Block[] = [];
  let cursor = 0;

  for (const paragraph of splitParagraphs(text)) {
    const body = text.slice(paragraph.start, paragraph.end);
    const trimmed = body.trim();
    if (trimmed.length === 0) continue;

    const heading = isMarkdown ? HEADING.exec(trimmed) : null;
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
        charStart: paragraph.start,
        charEnd: paragraph.end,
      });
      continue;
    }

    blocks.push({
      kind: isMarkdown && LIST_ITEM.test(trimmed) ? "listItem" : "paragraph",
      text: trimmed,
      charStart: paragraph.start,
      charEnd: paragraph.end,
    });
    cursor = paragraph.end;
  }

  void cursor;
  return { text, blocks };
}

interface Span {
  start: number;
  end: number;
}

/** Blank-line separated, with offsets preserved. */
function splitParagraphs(text: string): Span[] {
  const spans: Span[] = [];
  const separator = /\n\s*\n/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = separator.exec(text)) !== null) {
    spans.push({ start, end: match.index });
    start = match.index + match[0].length;
  }
  if (start < text.length) spans.push({ start, end: text.length });

  return spans;
}
