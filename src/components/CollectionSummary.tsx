"use client";

import { useState } from "react";

/**
 * On-demand orientation for a collection you did not build.
 *
 * Behind a button rather than generated on open, for two reasons: it costs a
 * model call every time a collection is visited, and someone returning to a
 * collection they know already does not need it. The people it helps are the
 * ones who will click it.
 */
export function CollectionSummary({
  collectionId,
  kind,
}: {
  collectionId: string;
  kind: "collection" | "chat";
}) {
  // One noun, derived once. Chats and collections are the same model (ADR-0022),
  // so every string that names the thing has to ask which it is looking at —
  // calling a chat "this collection" is the seam showing through.
  const noun = kind === "chat" ? "chat" : "collection";
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/collections/${collectionId}/summary`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not generate a summary.");
        return;
      }
      setSummary(data.summary);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  if (summary) {
    return (
      <div className="rounded-2xl border-[0.5px] border-line bg-surface-soft p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          What is in here
        </p>
        <div className="mt-2 flex flex-col gap-2.5">
          {summary.split(/\n\n+/).map((paragraph, index) => (
            <p key={index} className="text-[14px] leading-[1.65] text-body">
              {paragraph}
            </p>
          ))}
        </div>
        <p className="mt-3 border-t-[0.5px] border-line pt-2.5 text-xs leading-relaxed text-muted">
          Written from each document&rsquo;s sections and a sample of its text — so it describes what
          this {noun} covers, not what it concludes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={generate}
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
