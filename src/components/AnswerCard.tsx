"use client";

import { useState } from "react";

import { AnswerFeedback } from "./AnswerFeedback";
import { SourceList } from "./SourceList";
import type { AnswerPayload } from "./types";

export function AnswerCard({
  payload,
  onFollowUp,
}: {
  payload: AnswerPayload;
  onFollowUp: (question: string) => void;
}) {
  const [showProvenance, setShowProvenance] = useState(payload.outcome === "refused");
  const refused = payload.outcome === "refused";

  return (
    <div className="flex flex-col gap-3">
      {refused ? <Refusal payload={payload} /> : <Answer payload={payload} />}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="font-mono">{payload.model.model}</span>
        <span aria-hidden>·</span>
        <span className="tnum">{(payload.timing.totalMs / 1000).toFixed(1)}s</span>
        <span>·</span>
        <button
          type="button"
          onClick={() => setShowProvenance((open) => !open)}
          className="text-accent underline-offset-2 hover:underline"
        >
          {showProvenance ? "Hide sources" : "How did I get this?"}
        </button>
        <span aria-hidden>·</span>
        <AnswerFeedback traceId={payload.traceId} />
      </div>

      {showProvenance && (
        <div className="flex flex-col gap-2.5 rounded-xl border-[0.5px] border-line bg-surface-soft p-3.5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <Stat label="Top score" value={payload.grade.score?.toFixed(3) ?? "—"} />
            <Stat label="Retrieval" value={`${payload.timing.retrievalMs}ms`} />
            <Stat label="Generation" value={`${payload.timing.generationMs}ms`} />
            <Stat label="Rewrite" value={payload.grade.rewriteFired ? "fired" : "not needed"} />
          </dl>
          {payload.grade.rewrittenAs && (
            <p className="text-xs text-muted">
              Retried as: <span className="text-body">{payload.grade.rewrittenAs}</span>
            </p>
          )}
          <SourceList sources={payload.sources} cited={payload.citations} />
        </div>
      )}

      {payload.followUps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {payload.followUps.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onFollowUp(question)}
              className="rounded-full border-[0.5px] border-line bg-surface px-3.5 py-1.5 text-left text-[13px] text-body shadow-xs hover:border-accent hover:text-ink hover:shadow-sm"
            >
              {question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Answer({ payload }: { payload: AnswerPayload }) {
  return (
    <div className="rounded-2xl border-[0.5px] border-line bg-surface p-4 shadow-sm">
      {/* A hairline accent rule marks answered content, so answered and refused
          are distinguishable at a glance before any text is read. */}
      <div className="flex gap-3.5">
        <span aria-hidden className="mt-1 w-0.5 shrink-0 rounded-full bg-accent/40" />
        <p className="whitespace-pre-wrap text-[15px] leading-[1.65] text-ink">{payload.answer}</p>
      </div>
      {payload.citations.length > 0 && (
        <p className="mt-3.5 border-t-[0.5px] border-line pt-2.5 text-xs text-muted">
          Drawn from{" "}
          {payload.citations.map((n, i) => {
            const source = payload.sources.find((s) => s.n === n);
            return (
              <span key={n}>
                {i > 0 && ", "}
                <span className="text-accent-on-tint">
                  {source?.filename ?? `source ${n}`}
                  {source?.page ? ` p${source.page}` : ""}
                </span>
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}

/**
 * The refusal surface (ADR-0019).
 *
 * Not a grey "I don't know", and deliberately not styled as an error: `--refusal`
 * derives from `--warn` rather than `--danger` (ADR-0021), because refusing is
 * the system working. Colouring it red would teach the reviewer the opposite of
 * the point.
 *
 * It shows what was searched and how close the best match came, so the reader
 * can tell "nothing relevant exists here" apart from "something went wrong" —
 * which is the distinction the whole design is built around.
 */
function Refusal({ payload }: { payload: AnswerPayload }) {
  return (
    <div className="rounded-2xl border-[0.5px] border-refusal/40 bg-refusal-tint p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-refusal">
        Not answered from these documents
      </p>
      <p className="mt-2 text-[15px] leading-[1.65] text-ink">{payload.refusalReason}</p>
      <p className="mt-3 border-t-[0.5px] border-refusal/25 pt-2.5 text-xs leading-relaxed text-body">
        {payload.sources.length === 0
          ? "Nothing in this collection matched the question at all."
          : `${payload.sources.length} passages were retrieved and read; the closest scored ${payload.grade.score?.toFixed(2)}. They are listed below so you can judge for yourself.`}{" "}
        The answer may be in another collection, or not in the corpus.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="tnum mt-0.5 font-mono text-[12px] text-body">{value}</dd>
    </div>
  );
}
