"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnswerCard } from "./AnswerCard";
import { DocumentList } from "./DocumentList";
import { PromoteChat } from "./PromoteChat";
import { SegmentedTabs } from "./SegmentedTabs";
import type { DocumentSummary, Exchange } from "./types";
import { useProvider } from "./useProvider";

type Tab = "ask" | "sources";

export function CollectionView({
  collectionId,
  name,
  kind,
  description,
}: {
  collectionId: string;
  name: string;
  kind: "collection" | "chat";
  description: string | null;
}) {
  const [tab, setTab] = useState<Tab>("ask");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { provider } = useProvider();
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/collections/${collectionId}`);
    if (!response.ok) return;
    const data = (await response.json()) as { documents: DocumentSummary[] };
    setDocuments(data.documents);
  }, [collectionId]);

  useEffect(() => {
    setExchanges([]);
    setTab("ask");
    void load();
  }, [collectionId, load]);

  useEffect(() => {
    if (exchanges.length > 0) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exchanges]);

  const ready = useMemo(() => documents.filter((d) => d.status === "ready"), [documents]);

  /**
   * Three openers, drawn one per document from the most recent documents before
   * taking a second from any one of them.
   *
   * A seeded department has several documents; three questions all from whichever
   * happens to be newest would make the collection look narrower than it is. Each
   * was generated at ingest from that document's own headings (ADR-0019), so the
   * whole set stays answerable by construction.
   */
  const starters = useMemo(() => {
    const pools = ready.map((d) => [...d.starterQuestions]);
    const picked: string[] = [];
    for (let round = 0; picked.length < 3 && round < 4; round++) {
      for (const pool of pools) {
        const next = pool.shift();
        if (next && !picked.includes(next)) picked.push(next);
        if (picked.length === 3) break;
      }
    }
    return picked;
  }, [ready]);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || asking) return;

    setTab("ask");
    setQuestion("");
    setAsking(true);
    setExchanges((current) => [...current, { question: trimmed }]);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionId, question: trimmed, provider }),
      });
      const data = await response.json();
      setExchanges((current) =>
        current.map((exchange, i) =>
          i === current.length - 1
            ? response.ok
              ? { ...exchange, payload: data }
              : { ...exchange, error: data.error ?? "The query failed." }
            : exchange,
        ),
      );
    } catch (error) {
      setExchanges((current) =>
        current.map((exchange, i) =>
          i === current.length - 1
            ? { ...exchange, error: error instanceof Error ? error.message : "The query failed." }
            : exchange,
        ),
      );
    } finally {
      setAsking(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError(null);

    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch(`/api/collections/${collectionId}/documents`, {
          method: "POST",
          body: form,
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setUploadError(data.error ?? `Could not ingest ${file.name}.`);
        }
      } finally {
        setUploading(null);
        await load();
      }
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6">
      <header className="shrink-0 pt-8 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {kind === "chat" && (
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                Chat
              </p>
            )}
            <h1 className="truncate text-[22px] font-medium text-ink">{name}</h1>
            {description && <p className="mt-1 text-sm leading-relaxed text-body">{description}</p>}
          </div>
          {kind === "chat" && (
            <PromoteChat chatId={collectionId} documentCount={documents.length} onMoved={load} />
          )}
        </div>
        <div className="mt-4">
          <SegmentedTabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "ask", label: "Ask" },
              { value: "sources", label: "Sources", badge: documents.length },
            ]}
          />
        </div>
      </header>

      {tab === "sources" ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
          <DocumentList documents={documents} onDeleted={load} />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-6 pb-6">
              <div className="flex flex-col gap-2">
                <UploadZone uploading={uploading} onFiles={upload} />
                {uploadError && (
                  <p className="rounded-lg bg-refusal-tint px-3 py-2 text-[13px] text-refusal">
                    {uploadError}
                  </p>
                )}
              </div>

              {exchanges.length === 0 && ready.length > 0 && (
                <div>
                  <p className="text-[15px] text-ink">What do you want to know?</p>
                  {starters.length > 0 && (
                    <div className="mt-3 flex flex-col items-start gap-2">
                      {starters.map((starter) => (
                        <button
                          key={starter}
                          type="button"
                          onClick={() => ask(starter)}
                          className="rounded-full border-[0.5px] border-line bg-surface px-3.5 py-2 text-left text-[13px] text-body transition-colors hover:border-accent hover:text-ink"
                        >
                          {starter}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {exchanges.map((exchange, index) => (
                <div key={`${index}-${exchange.question}`} className="flex flex-col gap-3">
                  <p className="text-[15px] font-medium text-ink">{exchange.question}</p>
                  {exchange.payload ? (
                    <AnswerCard payload={exchange.payload} onFollowUp={ask} />
                  ) : exchange.error ? (
                    <p className="rounded-xl border-[0.5px] border-danger/40 bg-surface p-3 text-[13px] text-danger">
                      {exchange.error}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">
                      {provider === "ollama" ? "Thinking locally, this takes a while…" : "Thinking…"}
                    </p>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
            className="shrink-0 border-t-[0.5px] border-line bg-page py-4"
          >
            <div className="flex items-center gap-2 rounded-xl border-[0.5px] border-line bg-surface px-3 py-2">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={ready.length ? `Ask about ${name}…` : "Add a document to get started"}
                disabled={asking || ready.length === 0}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={asking || !question.trim()}
                className="shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] text-white transition-colors hover:bg-accent-strong disabled:opacity-40"
              >
                {asking ? "Asking…" : "Ask"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function UploadZone({
  uploading,
  onFiles,
}: {
  uploading: string | null;
  onFiles: (files: FileList | null) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFiles(event.dataTransfer.files);
      }}
      className={`flex cursor-pointer items-center justify-center rounded-xl border border-dashed px-4 py-4 text-center text-[13px] transition-colors ${
        dragging
          ? "border-accent bg-accent-tint text-accent-on-tint"
          : "border-line bg-surface text-muted hover:border-accent"
      }`}
    >
      <input
        type="file"
        multiple
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        className="sr-only"
        onChange={(event) => onFiles(event.target.files)}
      />
      {uploading ? `Indexing ${uploading}…` : "Drop a PDF, text or Markdown file, or click to choose"}
    </label>
  );
}
