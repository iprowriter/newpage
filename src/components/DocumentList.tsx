"use client";

import { useState } from "react";

import type { DocumentSummary } from "./types";

const STATUS_LABEL: Record<DocumentSummary["status"], string> = {
  pending: "Queued",
  processing: "Indexing",
  ready: "Ready",
  failed: "Failed",
  delete_failed: "Delete incomplete",
};

/**
 * Status and chunk count, not just filenames and dates (ADR-0019).
 *
 * A zero-text PDF is a hard failure at ingest (ADR-0018), and this list is where
 * that surfaces. A visible failure demonstrates handled failure; a document that
 * silently indexes to nothing looks like a retrieval bug for the rest of its life.
 */
const PER_PAGE = 6;

export function DocumentList({
  documents,
  onDeleted,
}: {
  documents: DocumentSummary[];
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  if (documents.length === 0) {
    return (
      <p className="rounded-xl border-[0.5px] border-line bg-surface px-4 py-8 text-center text-sm text-muted">
        No documents yet. Add one from the Ask tab.
      </p>
    );
  }

  // Paginated rather than a growing list: a real department collection runs to
  // hundreds of documents, and an infinite column buries the controls at the
  // bottom of the page.
  const pageCount = Math.ceil(documents.length / PER_PAGE);
  const current = Math.min(page, pageCount - 1);
  const visible = documents.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
    <ul className="flex flex-col gap-1">
      {visible.map((document) => (
        <li
          key={document.id}
          className="flex items-center gap-3 rounded-lg border-[0.5px] border-line bg-surface px-3 py-2"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-ink">{document.filename}</span>
            <span className="mt-0.5 block truncate text-xs text-muted">
              {document.status === "ready"
                ? `${document.chunkCount} chunks${document.pageCount ? ` · ${document.pageCount} pages` : ""} · added ${new Date(document.createdAt).toLocaleDateString()}`
                : (document.error ?? STATUS_LABEL[document.status])}
            </span>
          </span>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
              document.status === "ready"
                ? "bg-surface-soft text-muted"
                : document.status === "processing" || document.status === "pending"
                  ? "bg-accent-tint text-accent-on-tint"
                  : "bg-refusal-tint text-refusal"
            }`}
          >
            {STATUS_LABEL[document.status]}
          </span>

          {/* Confirmation is accident prevention, not authorisation — there is no
              auth in this build, deliberately (ADR-0020). */}
          {confirming === document.id ? (
            <span className="flex shrink-0 items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => remove(document.id)}
                disabled={deleting === document.id}
                className="text-danger hover:underline"
              >
                {deleting === document.id ? "Removing…" : "Confirm"}
              </button>
              <button type="button" onClick={() => setConfirming(null)} className="text-muted hover:text-ink">
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(document.id)}
              className="shrink-0 text-xs text-muted hover:text-danger"
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>

    {pageCount > 1 && (
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setPage(current - 1)}
          disabled={current === 0}
          className="rounded-lg border-[0.5px] border-line bg-surface px-3 py-1.5 text-body transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-body"
        >
          Previous
        </button>
        <span className="text-muted">
          {current * PER_PAGE + 1}–{Math.min((current + 1) * PER_PAGE, documents.length)} of {documents.length}
        </span>
        <button
          type="button"
          onClick={() => setPage(current + 1)}
          disabled={current >= pageCount - 1}
          className="rounded-lg border-[0.5px] border-line bg-surface px-3 py-1.5 text-body transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-body"
        >
          Next
        </button>
      </div>
    )}
    </div>
  );
}
