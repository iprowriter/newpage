"use client";

import { useState } from "react";

import type { Source } from "./types";

export interface SourceHighlight {
  chunkId: string;
  /** Offsets into that source's displayText. */
  start: number;
  end: number;
}

/**
 * Provenance, one click from the answer and with no navigation (ADR-0019).
 *
 * Scores are shown rather than hidden. A reviewer assessing a retrieval system
 * wants to see how close the second-best match was, and a citation you cannot
 * inspect is a claim rather than evidence.
 */
export function SourceList({
  sources,
  cited,
  highlight,
}: {
  sources: Source[];
  /** Defaulted: an older trace can arrive without it, and that is not worth a crash. */
  cited?: number[];
  highlight?: SourceHighlight | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Attribution opens the passage it landed on, rather than asking the reader to
  // find it: being told "source 3" and then having to go clicking is the work the
  // feature exists to remove. Adjusting during render rather than in an effect —
  // a new highlight is derived state, not a synchronisation with anything
  // outside React, and an effect here would render the list closed for a frame
  // and then snap it open.
  const [tracked, setTracked] = useState(highlight);
  if (highlight !== tracked) {
    setTracked(highlight);
    if (highlight) setOpenId(highlight.chunkId);
  }

  if (sources.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {sources.map((source) => {
        const used = (cited ?? []).includes(source.n);
        const open = openId === source.chunkId;
        return (
          <li key={source.chunkId} className="rounded-lg border-[0.5px] border-line bg-surface shadow-xs">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : source.chunkId)}
              className="flex w-full items-start gap-3 px-3 py-2 text-left"
              aria-expanded={open}
            >
              <span
                className={`tnum mt-px shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[11px] ${
                  used ? "bg-citation-tint text-accent-on-tint" : "bg-surface-soft text-muted"
                }`}
              >
                {source.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">
                  {source.filename}
                  {source.page ? <span className="text-muted"> · page {source.page}</span> : null}
                </span>
                {source.headingPath.length > 0 && (
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {source.headingPath.join(" › ")}
                  </span>
                )}
              </span>
              <ScoreBar score={source.score} />
            </button>
            {open && source.available === false && (
              <p className="border-t-[0.5px] border-line px-3 py-2.5 text-[13px] leading-relaxed text-muted">
                This passage is no longer available: the document it came from has been deleted
                since this answer was written.
              </p>
            )}
            {open && source.available !== false && (
              <p className="border-t-[0.5px] border-line px-3 py-2.5 text-[13px] leading-relaxed text-body">
                {highlight?.chunkId === source.chunkId ? (
                  <Highlighted text={source.displayText} start={highlight.start} end={highlight.end} />
                ) : (
                  source.displayText
                )}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The matched span, marked in place inside the full passage.
 *
 * Showing the span alone would be a worse citation than the one it replaces: the
 * reader could not see what surrounds it, which is the context that tells them
 * whether the answer used it fairly.
 */
function Highlighted({ text, start, end }: { text: string; start: number; end: number }) {
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-[3px] bg-citation-tint px-0.5 text-accent-on-tint">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function ScoreBar({ score }: { score: number }) {
  // Cosine similarity on this corpus lives roughly in 0.4–0.85, so a 0–1 bar
  // would render every result as a nearly identical stub. Rescaled to the range
  // that actually occurs, which is what makes the comparison legible.
  const normalised = Math.max(0, Math.min(1, (score - 0.4) / 0.45));
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-soft">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${normalised * 100}%`,
            background: normalised > 0.55 ? "var(--score-high)" : "var(--score-low)",
          }}
        />
      </span>
      <span className="tnum w-8 text-right font-mono text-[11px] text-muted">{score.toFixed(2)}</span>
    </span>
  );
}
