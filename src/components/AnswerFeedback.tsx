"use client";

import { useState } from "react";

import { ThumbIcon } from "./icons";

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
export function AnswerFeedback({
  traceId,
  initial = null,
}: {
  traceId: string;
  /** A rating this answer already carries, when it is being read back from history. */
  initial?: Rating | null;
}) {
  const [rating, setRating] = useState<Rating | null>(initial);
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
        verdict="up"
        active={rating === "up"}
        activeClass="text-success"
        onClick={() => send("up")}
      />
      <Button
        label="Not helpful"
        verdict="down"
        active={rating === "down"}
        activeClass="text-danger"
        onClick={() => send("down")}
      />
      {failed && <span className="ml-1 text-[11px] text-muted">not saved</span>}
    </span>
  );
}

function Button({
  label,
  verdict,
  active,
  activeClass,
  onClick,
}: {
  label: string;
  verdict: "up" | "down";
  active: boolean;
  activeClass: string;
  onClick: () => void;
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
      <ThumbIcon verdict={verdict} />
    </button>
  );
}
