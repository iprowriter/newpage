"use client";

import { useState } from "react";

import { ChevronIcon } from "./icons";
import type { ProviderId } from "./useProvider";

/**
 * On-demand orientation for a collection you did not build — kept, once it has
 * been asked for.
 *
 * Still behind a button rather than generated at ingest (ADR-0026): it costs a
 * model call, a four-file upload would spend four of them to keep the last one,
 * and coupling ingestion to a provider would mean an upload that fails because a
 * summary nobody asked for could not be written.
 *
 * What changed is what happens *after* the button. The summary was already
 * persisted server-side; this component simply never read it back, so it lived
 * exactly as long as the component did — gone on the next navigation, and gone
 * the moment the first question was asked, because it used to render only in the
 * empty-thread branch. Now the stored one arrives with the collection and the
 * card stays put above the thread, collapsed once there is a conversation to
 * read instead.
 *
 * Deliberately not owning the summary itself: `CollectionView` holds it, because
 * the same fetch that refreshes the document list is what decides whether a
 * stored summary is still current. Two copies would let the card go on
 * describing a document set the list beside it no longer shows.
 */
export function CollectionSummary({
  collectionId,
  kind,
  summary,
  stale,
  provider,
  startOpen,
  onSummary,
}: {
  collectionId: string;
  kind: "collection" | "chat";
  summary: string | null;
  stale: boolean;
  provider: ProviderId;
  startOpen: boolean;
  onSummary: (summary: string) => void;
}) {
  // One noun, derived once. Chats and collections are the same model (ADR-0022),
  // so every string that names the thing has to ask which it is looking at —
  // calling a chat "this collection" is the seam showing through.
  const noun = kind === "chat" ? "chat" : "collection";
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Follows the thread: open while there is nothing to read, collapsed once
   * there is. `startOpen` only ever flips when the first question is asked, so
   * this is not fighting the reader — a manual toggle after that point stands,
   * because nothing changes it again for the life of the collection.
   *
   * Adjusted during render rather than in an effect. The effect version renders
   * the card open, commits, then re-renders it closed, which is both a visible
   * flicker and what `react-hooks/set-state-in-effect` is pointing at; setting
   * state during render makes React discard this pass and redo it before the
   * browser sees anything. Keying the component on the thread's emptiness would
   * also work, but it would throw away an in-flight regenerate along with it.
   */
  const [followed, setFollowed] = useState(startOpen);
  if (followed !== startOpen) {
    setFollowed(startOpen);
    setOpen(startOpen);
  }

  const generate = async (force: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // The provider goes with the request for the same reason `/api/query`
      // sends it: the toggle is the reader's choice of model, and a summarise
      // that ignored it would fail on a missing key for a provider they are not
      // using. `force` is what makes "Summarise again" mean anything — without
      // it the fingerprint cache returns the same text and the button looks dead.
      const params = new URLSearchParams({ provider });
      if (force) params.set("force", "1");
      const response = await fetch(`/api/collections/${collectionId}/summary?${params}`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not generate a summary.");
        return;
      }
      onSummary(data.summary);
      setOpen(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  if (summary) {
    return (
      <div className="rounded-2xl border-[0.5px] border-line bg-surface-soft">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-muted transition-colors hover:text-body"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.06em]">
            What is in here
          </span>
          <ChevronIcon open={open} />
        </button>

        {open && (
          <div className="px-4 pb-4">
            <div className="flex flex-col gap-2.5">
              {summary.split(/\n\n+/).map((paragraph, index) => (
                <p key={index} className="text-[14px] leading-[1.65] text-body">
                  {paragraph}
                </p>
              ))}
            </div>
            <p className="mt-3 border-t-[0.5px] border-line pt-2.5 text-xs leading-relaxed text-muted">
              Written from each document&rsquo;s sections and a sample of its text — so it describes
              what this {noun} covers, not what it concludes.
            </p>
            <button
              type="button"
              onClick={() => void generate(true)}
              disabled={busy}
              className="mt-3 rounded-full border-[0.5px] border-line bg-surface px-3 py-1.5 text-xs text-body shadow-xs transition-colors hover:border-accent hover:text-ink hover:shadow-sm disabled:opacity-50"
            >
              {busy ? `Reading the ${noun} again…` : "Summarise again"}
            </button>
            {error && (
              <p className="mt-2 rounded-lg bg-refusal-tint px-3 py-2 text-[13px] leading-relaxed text-refusal">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Said plainly rather than shown as an out-of-date summary. The documents
          moved under it, so the text that exists describes a set that is no
          longer here — and a reader has no way of telling that by looking. */}
      {stale && (
        <p className="mb-2 text-[13px] leading-relaxed text-muted">
          This {noun} has changed since it was last summarised.
        </p>
      )}
      <button
        type="button"
        onClick={() => void generate(false)}
        disabled={busy}
        className="flex items-center gap-2 rounded-full border-[0.5px] border-line bg-surface px-3.5 py-2 text-[13px] text-body shadow-xs hover:border-accent hover:text-ink hover:shadow-sm disabled:opacity-50"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M3 3.2h8M3 7h8M3 10.8h5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        {busy ? `Reading the ${noun}…` : `Summarise this ${noun}`}
      </button>
      {error && (
        <p className="mt-2 rounded-lg bg-refusal-tint px-3 py-2 text-[13px] leading-relaxed text-refusal">
          {error}
        </p>
      )}
    </div>
  );
}
