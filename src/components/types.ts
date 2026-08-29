export interface DocumentSummary {
  id: string;
  filename: string;
  status: "pending" | "processing" | "ready" | "failed" | "delete_failed";
  error: string | null;
  pageCount: number | null;
  chunkCount: number;
  starterQuestions: string[];
  createdAt: string;
}

export interface Source {
  n: number;
  chunkId: string;
  documentId: string;
  filename: string;
  page: number | null;
  headingPath: string[];
  score: number;
  displayText: string;
}

export interface AnswerPayload {
  traceId: string;
  outcome: "answered" | "refused";
  answer: string | null;
  refusalReason: string | null;
  citations: number[];
  followUps: string[];
  sources: Source[];
  grade: { score: number | null; rewriteFired: boolean; rewrittenAs: string | null };
  timing: { totalMs: number; retrievalMs: number; generationMs: number };
  model: { provider: string; model: string; embeddingModel: string };
}

export interface QueryFailure {
  message: string;
  kind:
    | "unavailable"
    | "rate_limited"
    | "auth"
    | "model_retired"
    | "model_missing"
    | "network"
    | "unknown";
  retryable: boolean;
  provider: string;
}

export interface Exchange {
  question: string;
  payload?: AnswerPayload;
  failure?: QueryFailure;
}
