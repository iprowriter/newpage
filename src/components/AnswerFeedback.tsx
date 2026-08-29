"use client";

import { useState } from "react";

type Rating = "up" | "down";

/**
 * A reader's verdict on one answer.
 *
 * Placed beside "How did I get this?" on purpose: provenance and judgement are
 * the same act. Someone who has just inspected the sources is the only person
 * qualified to say whether the answer used them well, and asking at any other
 * moment gets a worse label.
 *
 * The rating lands on the trace next to the chunks, scores, prompt and model
 * that produced it, so a thumbs-down is a reproducible case rather than a
 * complaint — and the set of them becomes an eval suite built from real
 * questions instead of ones I invented.
 */
export function AnswerFeedback({ traceId }: { traceId: string }) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [failed, setFailed] = useState(false);

  const send = async (next: Rating) => {
    const previous = rating;
    // Optimistic: the label is the point, and a rating that visibly lags feels
    // like it was not recorded. Reverted below if the write actually fails.
    setRating(next);
    setFailed(false);
    try {
      const response = await fetch(`/api/traces/${traceId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: next }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setRating(previous);
      setFailed(true);
    }
  };

  return (
    <span className="flex items-center gap-0.5">
      <Button
        label="Helpful"
        active={rating === "up"}
        activeClass="text-success"
        onClick={() => send("up")}
        path="M4.6 12.4V6.9m0 5.5h5.1a1.2 1.2 0 0 0 1.2-1l.7-4.1a1.2 1.2 0 0 0-1.2-1.4H8.2l.3-2.3a1.1 1.1 0 0 0-2.1-.6L4.6 6.9m0 5.5H2.8V6.9h1.8"
      />
      <Button
        label="Not helpful"
        active={rating === "down"}
        activeClass="text-danger"
        onClick={() => send("down")}
        path="M9.4 1.6v5.5m0-5.5H4.3a1.2 1.2 0 0 0-1.2 1l-.7 4.1a1.2 1.2 0 0 0 1.2 1.4h2.2l-.3 2.3a1.1 1.1 0 0 0 2.1.6l1.8-3.9m0-5.5h1.8v5.5H9.4"
      />
      {failed && <span className="ml-1 text-[11px] text-muted">not saved</span>}
    </span>
  );
}

function Button({
  label,
  active,
  activeClass,
  onClick,
  path,
}: {
  label: string;
  active: boolean;
  activeClass: string;
  onClick: () => void;
  path: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`rounded-md p-1 ${active ? activeClass : "text-muted hover:text-ink"}`}
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path
          d={path}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
