"use client";

import { useState } from "react";

import type { Source } from "./types";

/**
 * Provenance, one click from the answer and with no navigation (ADR-0019).
 *
 * Scores are shown rather than hidden. A reviewer assessing a retrieval system
 * wants to see how close the second-best match was, and a citation you cannot
 * inspect is a claim rather than evidence.
 */
export function SourceList({ sources, cited }: { sources: Source[]; cited: number[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (sources.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {sources.map((source) => {
        const used = cited.includes(source.n);
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
            {open && (
              <p className="border-t-[0.5px] border-line px-3 py-2.5 text-[13px] leading-relaxed text-body">
                {source.displayText}
              </p>
            )}
          </li>
        );
      })}
    </ul>
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
