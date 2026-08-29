/**
 * Shared shapes for the retrieval core.
 *
 * Everything here is plain data. No framework types, no Prisma types — the core
 * takes plain arguments and returns plain values so scripts/eval.ts can drive it
 * headless (ADR-0007, enforced by the ESLint rule on this directory).
 */

/** A structural unit recovered from a document by the extractor. */
export type BlockKind = "heading" | "paragraph" | "listItem";

export interface Block {
  kind: BlockKind;
  /** Heading depth, 1-based. Only meaningful when kind is "heading". */
  level?: number;
  text: string;
  /** 1-based page number. Absent for formats without pages (txt, md). */
  page?: number;
  /** Offsets into ExtractedDocument.text. */
  charStart: number;
  charEnd: number;
}

export interface ExtractedDocument {
  /**
   * The full document text. Every offset in the pipeline indexes into this
   * string, so chunk spans stay exact and a citation can be highlighted against
   * the original rather than against a reassembled approximation.
   */
  text: string;
  blocks: Block[];
  pageCount?: number;
}

/** A chunk, before it has been persisted or embedded. */
export interface ProducedChunk {
  chunkIndex: number;
  page?: number;
  /** Section stack at this point in the document, outermost first. */
  headingPath: string[];
  /**
   * What the reader sees when they open a citation: an exact slice of the source
   * text. No breadcrumb.
   */
  displayText: string;
  /**
   * What gets embedded: the heading breadcrumb followed by the body (ADR-0012).
   * A chunk embedded in isolation has lost the context that made it meaningful;
   * the breadcrumb restores most of it for a few tokens.
   *
   * These two fields differing is deliberate and easy to get subtly wrong, which
   * is why chunk.test.ts asserts on it directly.
   */
  embedText: string;
  charStart: number;
  charEnd: number;
  tokenCount: number;
}

export interface ChunkOptions {
  /** Target size. Compared against estimateTokens, not a real tokenizer. */
  chunkTokens: number;
  /** Sentences of overlap carried into a chunk that continues a section. */
  overlapSentences: number;
  /** Prepended to every breadcrumb so a chunk knows which document it is from. */
  docTitle: string;
}

/** A chunk that came back from a search, with its score. */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  collectionId: string;
  score: number;
  page?: number;
  headingPath: string[];
  displayText: string;
  filename: string;
}
