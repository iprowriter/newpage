"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnswerCard } from "./AnswerCard";
import { ChatInput } from "./ChatInput";
import { CollectionSummary } from "./CollectionSummary";
import { collectionsChanged } from "./collectionsBus";
import { DocumentList } from "./DocumentList";
import { FailureCard } from "./FailureCard";
import { PromoteChat } from "./PromoteChat";
import { ScrollAffordance } from "./ScrollAffordance";
import { SegmentedTabs } from "./SegmentedTabs";
import { Thinking } from "./Thinking";
import type { DocumentSummary, Exchange, QueryFailure } from "./types";
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
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const { provider } = useProvider();
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/collections/${collectionId}`);
    if (!response.ok) return;
    const data = (await response.json()) as { documents: DocumentSummary[] };
    setDocuments(data.documents);
  }, [collectionId]);

  /**
   * Reload this view *and* tell the sidebar to re-read. Ingestion renames a chat
   * and changes its counts, and without the second half the sidebar sat on stale
   * "New chat · Empty" until the next navigation.
   */
  const loadAll = useCallback(async () => {
    await load();
    collectionsChanged();
  }, [load]);

  /**
   * Rebuild the thread when the collection changes.
   *
   * This used to clear `exchanges` and stop there, which meant every visit
   * started blank and a conversation was lost the moment you looked at anything
   * else. The questions were never actually lost: they were in `query_traces`
   * the whole time, indexed on `(collectionId, createdAt)` for this read.
   *
   * `cancelled` matters because the sidebar makes it easy to click through
   * several collections quickly, and a slow response for the first must not
   * overwrite a fast one for the third.
   */
  useEffect(() => {
    let cancelled = false;
    setExchanges([]);
    setTab("ask");
    setHistoryLoaded(false);
    setTruncated(false);
    void load();

    void (async () => {
      try {
        const response = await fetch(`/api/collections/${collectionId}/history`);
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { history: Exchange[]; truncated: boolean };
        if (cancelled) return;
        setExchanges(data.history);
        setTruncated(data.truncated);
      } catch {
        // A history that will not load must not block asking a new question.
        // The thread starts empty and the input still works.
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [collectionId, load]);

  /**
   * Follow new answers, but land at the bottom of restored history rather than
   * scrolling through it. Smoothly replaying a month of old questions on every
   * visit would be a small piece of theatre at the reader's expense.
   *
   * Scrolls the thread pane by hand rather than calling `scrollIntoView` on a
   * sentinel. `scrollIntoView` walks *every* scrollable ancestor to reveal the
   * target, and `overflow: hidden` does not stop it — hidden containers are
   * still scrollable from script. Here that meant the shell itself was being
   * scrolled, which dragged the sidebar up off the top of the window while an
   * answer was loading. Addressing the one element that should move cannot do
   * that.
   */
  const jumped = useRef(false);
  useEffect(() => {
    jumped.current = false;
  }, [collectionId]);

  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane || exchanges.length === 0) return;
    pane.scrollTo({ top: pane.scrollHeight, behavior: jumped.current ? "smooth" : "instant" });
    jumped.current = true;
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
      const failure: QueryFailure | undefined = response.ok
        ? undefined
        : {
            message: data.error ?? "The query failed.",
            kind: data.kind ?? "unknown",
            retryable: data.retryable ?? false,
            provider: data.provider ?? provider,
          };
      setExchanges((current) =>
        current.map((exchange, i) =>
          i === current.length - 1
            ? failure
              ? { ...exchange, failure }
              : { ...exchange, payload: data }
            : exchange,
        ),
      );
    } catch (error) {
      setExchanges((current) =>
        current.map((exchange, i) =>
          i === current.length - 1
            ? {
                ...exchange,
                failure: {
                  message:
                    error instanceof Error
                      ? `The request did not complete: ${error.message}`
                      : "The request did not complete.",
                  kind: "network",
                  retryable: true,
                  provider,
                },
              }
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
        await loadAll();
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
            <PromoteChat chatId={collectionId} documentCount={documents.length} onMoved={loadAll} />
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
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
          <DocumentList documents={documents} onDeleted={loadAll} />
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col gap-6 pb-6">
              <div className="flex flex-col gap-2">
                <UploadZone uploading={uploading} onFiles={upload} />
                {uploadError && (
                  <p className="rounded-lg bg-refusal-tint px-3 py-2 text-[13px] text-refusal">
                    {uploadError}
                  </p>
                )}
              </div>

              {historyLoaded && exchanges.length === 0 && ready.length > 0 && (
                <div>
                  {/* Offered before the questions, because orientation comes
                      before interrogation for someone who did not build this. */}
                  <CollectionSummary collectionId={collectionId} kind={kind} />

                  <p className="mt-6 text-[15px] text-ink">What do you want to know?</p>
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

              {truncated && (
                <p className="text-center text-xs text-muted">
                  Showing the most recent questions. Every one is kept in{" "}
                  <a href="/traces" className="text-accent underline-offset-2 hover:underline">
                    traces
                  </a>
                  .
                </p>
              )}

              {exchanges.map((exchange, index) => (
                <div key={`${index}-${exchange.question}`} className="flex flex-col gap-3">
                  <p className="text-[15px] font-medium text-ink">{exchange.question}</p>
                  {exchange.payload ? (
                    <AnswerCard payload={exchange.payload} onFollowUp={ask} />
                  ) : exchange.failure ? (
                    <FailureCard
                      failure={exchange.failure}
                      onRetry={() => {
                        // Drop the failed exchange and ask again, so a retry
                        // replaces the failure rather than stacking a second
                        // copy of the same question beneath it.
                        setExchanges((current) => current.slice(0, index));
                        void ask(exchange.question);
                      }}
                    />
                  ) : (
                    <Thinking local={provider === "ollama"} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t-[0.5px] border-line bg-page py-4">
            <ScrollAffordance scrollRef={scrollRef} />
            <ChatInput
              value={question}
              onChange={setQuestion}
              onSubmit={() => void ask(question)}
              disabled={asking || ready.length === 0}
              busy={asking}
              placeholder={ready.length ? `Ask about ${name}…` : "Add a document to get started"}
            />
          </div>
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
