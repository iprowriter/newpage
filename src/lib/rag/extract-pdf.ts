import type { Block, ExtractedDocument } from "./types";

/**
 * PDF extraction via pdfjs-dist (ADR-0018).
 *
 * pdfjs was chosen over the alternatives for a specific reason: the document
 * viewer will be pdfjs regardless, because that is what renders a PDF in a
 * browser. Extracting with one library and highlighting with another means
 * reconciling two coordinate systems for the one feature where coordinates are
 * the whole point.
 *
 * The honest limitation, stated here and in the README: pdfjs returns text items
 * in *document* order, not *reading* order. Single-column prose — which is what
 * FDA guidance is (ADR-0017) — comes out correct. Multi-column layouts can
 * interleave, and tables flatten to a sequence of cell strings with their
 * row/column relationships gone. Neither is fixed here. Fixing them means a
 * layout-aware parser, which in practice means Python, which is a productionisation
 * note rather than a take-home rewrite (ADR-0011).
 */

// Tuning constants. Grouped and named because the alternative is six unexplained
// numbers scattered through the parsing logic.
const LINE_Y_TOLERANCE = 2.5;
const PARAGRAPH_GAP_RATIO = 1.6;
const HEADING_SIZE_RATIO = 1.12;
const HEADER_FOOTER_PAGE_FRACTION = 0.5;
const MIN_PAGES_FOR_HEADER_DETECTION = 3;

/** "I. INTRODUCTION", "A. Scope", "1. Background" — the FDA guidance house style. */
const NUMBERED_HEADING = /^(?:([IVXLCDM]+)|([A-Z])|(\d+(?:\.\d+)*))[.)]\s+[A-Z(]/;
/** A bare integer as its own text item at the left margin: a line-number gutter. */
const GUTTER_NUMBER = /^\d{1,4}$/;
const BARE_PAGE_NUMBER = /^(?:page\s+)?\d+(?:\s+of\s+\d+)?$/i;
/** A dotted leader: "B. Details of Approach ......... 7". Table of contents. */
const TOC_LEADER = /\.{4,}\s*\d*\s*$/;

interface Line {
  text: string;
  page: number;
  y: number;
  fontSize: number;
}

export async function extractPdf(data: Uint8Array): Promise<ExtractedDocument> {
  const lines = await readLines(data);
  const pageCount = lines.length > 0 ? Math.max(...lines.map((l) => l.page)) : 0;
  const kept = stripRunningHeaders(lines, pageCount);

  if (kept.length === 0) {
    // A scanned PDF yields no text layer. Failing loudly here is the whole point:
    // a silent empty ingest produces a document that answers nothing and looks
    // like a retrieval bug for the rest of its life (ADR-0018).
    throw new Error(
      "No text could be extracted. This looks like a scanned or image-only PDF; OCR is not supported.",
    );
  }

  const bodySize = medianFontSize(kept);
  return buildDocument(kept, bodySize, pageCount);
}

async function readLines(data: Uint8Array): Promise<Line[]> {
  // The legacy build is the one that runs under Node. Imported dynamically so
  // this module stays cheap for callers that only need the text extractor.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // v6 moved destroy() onto the loading task, so the task is kept rather than
  // discarded after awaiting .promise — otherwise the worker is never torn down
  // and a long ingest leaks one per document.
  const loadingTask = pdfjs.getDocument({
    data,
    // Errors only. pdfjs warns per page that it cannot load the standard-14 font
    // data, which is genuinely irrelevant here: font programs describe how to
    // *draw* glyphs, and this path only ever reads text content and geometry.
    // Silenced rather than satisfied, so a real error still surfaces.
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  const lines: Line[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    // Group items into visual lines by their y coordinate. transform[5] is y,
    // transform[3] is the vertical scale, which is effectively the font size.
    interface Item {
      x: number;
      width: number;
      str: string;
    }
    interface Bucket {
      items: Item[];
      y: number;
      size: number;
    }
    const buckets = new Map<number, Bucket>();

    for (const item of content.items) {
      if (!("str" in item) || item.str.trim().length === 0) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      const size = Math.abs(item.transform[3]) || 0;

      const key = [...buckets.keys()].find((k) => Math.abs(k - y) <= LINE_Y_TOLERANCE);
      const bucket: Bucket = key !== undefined ? buckets.get(key)! : { items: [], y, size: 0 };
      bucket.items.push({ x, width: item.width ?? 0, str: item.str });
      bucket.size = Math.max(bucket.size, size);
      buckets.set(key ?? y, bucket);
    }

    const pageLines = [...buckets.values()]
      .sort((a, b) => b.y - a.y) // PDF origin is bottom-left, so descending y is top-down
      .map((bucket) => ({
        text: joinItems(dropGutterNumber(bucket.items.sort((a, b) => a.x - b.x)), bucket.size),
        page: pageNumber,
        y: bucket.y,
        fontSize: bucket.size,
      }))
      .filter((line) => line.text.length > 0);

    lines.push(...pageLines);
  }

  await loadingTask.destroy();
  return lines;
}

/**
 * pdfjs emits a line as separate text items with no spaces between them: a naive
 * join produces "aspredicate rules". Real word gaps are recoverable from the
 * geometry — an item starting measurably right of where the previous one ended
 * had a space there.
 */
function joinItems(items: { x: number; width: number; str: string }[], fontSize: number): string {
  const gapThreshold = Math.max(fontSize * 0.18, 0.6);
  let out = "";
  let cursorX: number | undefined;

  for (const item of items) {
    if (cursorX !== undefined && item.x - cursorX > gapThreshold && !out.endsWith(" ")) {
      out += " ";
    }
    out += item.str;
    cursorX = item.x + item.width;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Strips a left-margin line-number gutter.
 *
 * FDA guidance issued for comment carries line numbers down the margin. pdfjs
 * reports them as ordinary text on the same visual line, so without this they
 * glue onto the prose ("116As described in more detail below") — which corrupts
 * the text, poisons the embedding, and makes "111) are referred to..." match the
 * numbered-heading pattern. Removed here rather than regexed out downstream,
 * because at this point the geometry that identifies them is still available.
 */
function dropGutterNumber(items: { x: number; width: number; str: string }[]): { x: number; width: number; str: string }[] {
  if (items.length < 2) return items;
  const [first, second] = items;
  if (!GUTTER_NUMBER.test(first.str.trim())) return items;
  // Only when the rest of the line starts clear of it — a genuine gutter sits in
  // its own column, whereas "1" in a numbered list runs straight into its text.
  return second.x - (first.x + first.width) > 1.5 ? items.slice(1) : items;
}

/**
 * Drops lines that repeat at the same position across most pages.
 *
 * Not cosmetic. FDA guidance carries "Contains Nonbinding Recommendations" as a
 * header on every single page; left in, it lands in most chunks and every one of
 * those embeddings is pulled slightly toward a phrase that carries no meaning.
 * It also makes near-duplicate chunks compete with each other at retrieval time.
 *
 * Table-of-contents entries go the same way and for the same reason: their text
 * duplicates the headings they point at, so keeping them manufactures a rival
 * chunk for every real section, differing only by a page number.
 */
function stripRunningHeaders(lines: Line[], pageCount: number): Line[] {
  if (pageCount < MIN_PAGES_FOR_HEADER_DETECTION) {
    return lines.filter((line) => !BARE_PAGE_NUMBER.test(line.text) && !TOC_LEADER.test(line.text));
  }

  const pagesByText = new Map<string, Set<number>>();
  for (const line of lines) {
    const set = pagesByText.get(line.text) ?? new Set<number>();
    set.add(line.page);
    pagesByText.set(line.text, set);
  }

  const threshold = pageCount * HEADER_FOOTER_PAGE_FRACTION;
  return lines.filter((line) => {
    if (BARE_PAGE_NUMBER.test(line.text)) return false;
    if (TOC_LEADER.test(line.text)) return false;
    return (pagesByText.get(line.text)?.size ?? 0) <= threshold;
  });
}

function medianFontSize(lines: Line[]): number {
  const sizes = lines.map((l) => l.fontSize).filter((s) => s > 0).sort((a, b) => a - b);
  return sizes.length > 0 ? sizes[Math.floor(sizes.length / 2)] : 12;
}

/**
 * Assembles the canonical text and the block list together, so every offset is
 * produced by the same pass that produces the string it indexes into. Deriving
 * one from the other afterwards is how offsets drift.
 */
function buildDocument(lines: Line[], bodySize: number, pageCount: number): ExtractedDocument {
  const blocks: Block[] = [];
  let text = "";

  let buffer: string[] = [];
  let bufferStart = 0;
  let bufferPage = 1;

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    const body = buffer.join(" ");
    text += body;
    blocks.push({
      kind: "paragraph",
      text: body,
      page: bufferPage,
      charStart: bufferStart,
      charEnd: text.length,
    });
    text += "\n\n";
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const previous = i > 0 ? lines[i - 1] : undefined;

    if (isHeading(line, bodySize)) {
      flushParagraph();
      const previousBlock = blocks[blocks.length - 1];
      // A cover-page title wraps across several lines, each of which looks like
      // its own heading. Merging consecutive same-level headings keeps the
      // heading path from becoming four fragments of one sentence.
      if (
        previousBlock?.kind === "heading" &&
        previousBlock.level === headingLevel(line, bodySize) &&
        previousBlock.charEnd === text.length - 2
      ) {
        text = text.slice(0, previousBlock.charEnd) + " " + line.text;
        previousBlock.text = `${previousBlock.text} ${line.text}`;
        previousBlock.charEnd = text.length;
        text += "\n\n";
        continue;
      }
      const start = text.length;
      text += line.text;
      blocks.push({
        kind: "heading",
        level: headingLevel(line, bodySize),
        text: line.text,
        page: line.page,
        charStart: start,
        charEnd: text.length,
      });
      text += "\n\n";
      continue;
    }

    const newParagraph =
      previous !== undefined &&
      (previous.page !== line.page ||
        Math.abs(previous.y - line.y) > line.fontSize * PARAGRAPH_GAP_RATIO);

    if (newParagraph) flushParagraph();

    if (buffer.length === 0) {
      bufferStart = text.length;
      bufferPage = line.page;
    }
    buffer.push(line.text);
  }

  flushParagraph();
  return { text: text.trimEnd(), blocks, pageCount };
}

function isHeading(line: Line, bodySize: number): boolean {
  if (line.fontSize >= bodySize * HEADING_SIZE_RATIO && line.text.length < 120) return true;
  // Size alone misses FDA's convention of numbering sections in body-sized bold,
  // which pdfjs reports at the same scale as surrounding prose.
  return NUMBERED_HEADING.test(line.text) && line.text.length < 120;
}

function headingLevel(line: Line, bodySize: number): number {
  const numbered = NUMBERED_HEADING.exec(line.text);
  if (numbered) {
    if (numbered[1]) return 1; // I. II. III.
    if (numbered[2]) return 2; // A. B. C.
    return Math.min(3 + (numbered[3].split(".").length - 1), 6); // 1. / 1.1 / 1.1.1
  }
  return line.fontSize >= bodySize * 1.35 ? 1 : 2;
}
