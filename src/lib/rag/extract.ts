import { extractPdf } from "./extract-pdf";
import { extractText } from "./extract-text";
import type { ExtractedDocument } from "./types";

/**
 * Format dispatch (ADR-0018). PDF, plain text and Markdown — nothing else.
 *
 * Unsupported formats are rejected by name rather than attempted and half-parsed.
 * A .docx that ingests into garbled text is worse than one that refuses: the
 * first fails at retrieval time, months later, looking like a model problem.
 */

const MARKDOWN = new Set(["text/markdown", "text/x-markdown"]);
const PLAIN = new Set(["text/plain"]);

export function isSupported(mimeType: string): boolean {
  return mimeType === "application/pdf" || MARKDOWN.has(mimeType) || PLAIN.has(mimeType);
}

export async function extract(data: Uint8Array, mimeType: string): Promise<ExtractedDocument> {
  if (mimeType === "application/pdf") {
    return extractPdf(data);
  }
  if (MARKDOWN.has(mimeType) || PLAIN.has(mimeType)) {
    return extractText(new TextDecoder().decode(data), MARKDOWN.has(mimeType));
  }
  throw new Error(
    `Unsupported format "${mimeType}". This build accepts PDF, plain text and Markdown; ` +
      `.docx, .pptx and scanned/OCR PDFs are out of scope.`,
  );
}
