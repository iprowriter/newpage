"use client";

import { useEffect, useState } from "react";

interface Trace {
  id: string;
  collection: string;
  question: string;
  outcome: "answered" | "refused" | "error";
  refusalReason: string | null;
  gradeScore: number | null;
  rewriteFired: boolean;
  rewrittenAs: string | null;
  retrieved: { n: number; filename: string; page: number | null; score: number }[];
  provider: string;
  model: string;
  embeddingModel: string;
  latencyMs: number;
  retrievalMs: number | null;
  generationMs: number | null;
  promptTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

/**
 * Observability the reviewer can click, on their own queries, with no account
 * and no extra containers (ADR-0016).
 *
 * Traces persist to Postgres — which the app already needed — instead of a
 * self-hosted vendor stack that would have taken compose from three services to
 * roughly eight. OpenTelemetry is emitted alongside, so pointing this at Langfuse
 * or Datadog in production is configuration rather than instrumentation work.
 */
/**
 * Read at build time by Next, so it is baked into the client bundle. Absent when
 * no viewer is configured, in which case the link simply does not render — the
 * in-app traces below stand on their own.
 */
const TRACE_UI_URL = process.env.NEXT_PUBLIC_TRACE_UI_URL;

export function TracesView() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/traces")
      .then((r) => r.json())
      .then(setTraces)
      .catch(() => setTraces([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-[22px] font-medium text-ink">Traces</h1>
      <p className="mt-1 text-sm leading-relaxed text-body">
        Every question, what came back, and what it cost. Refusals included — they are the
        interesting ones.
      </p>

      {/* Two views, deliberately. This page is shaped for *this* system: retrieved
          chunks, grade decisions, refusal reasons. Jaeger shows the same requests
          in the standard OpenTelemetry shape, which is what any vendor would
          consume — and having it running is what makes "already instrumented" a
          claim a reviewer can check rather than take on trust. */}
      {TRACE_UI_URL && (
        <a
          href={TRACE_UI_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full border-[0.5px] border-line bg-surface px-3.5 py-2 text-[13px] text-body shadow-xs hover:border-accent hover:text-ink hover:shadow-sm"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M2 10.6h3.1V12H2zM2 6.3h6.5v1.4H2zM2 2h10v1.4H2z"
              fill="currentColor"
            />
          </svg>
          OpenTelemetry spans in Jaeger
          <span className="text-muted">↗</span>
        </a>
      )}

      {traces.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No queries yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-1.5">
          {traces.map((trace) => {
            const open = openId === trace.id;
            return (
              <li key={trace.id} className="rounded-xl border-[0.5px] border-line bg-surface shadow-xs">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : trace.id)}
                  className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left"
                  aria-expanded={open}
                >
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                      trace.outcome === "answered"
                        ? "bg-success"
                        : trace.outcome === "refused"
                          ? "bg-refusal"
                          : "bg-danger"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{trace.question}</span>
                    <span className="tnum mt-0.5 block text-xs text-muted">
                      {trace.collection} · {trace.outcome} · {(trace.latencyMs / 1000).toFixed(1)}s ·{" "}
                      <span className="font-mono">{trace.model}</span>
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="border-t-[0.5px] border-line px-3.5 py-3">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                      <Stat label="Top score" value={trace.gradeScore?.toFixed(3) ?? "—"} />
                      <Stat label="Retrieval" value={trace.retrievalMs ? `${trace.retrievalMs}ms` : "—"} />
                      <Stat label="Generation" value={trace.generationMs ? `${trace.generationMs}ms` : "—"} />
                      <Stat label="Rewrite" value={trace.rewriteFired ? "fired" : "not needed"} />
                      <Stat label="Prompt tokens" value={trace.promptTokens?.toString() ?? "—"} />
                      <Stat label="Output tokens" value={trace.outputTokens?.toString() ?? "—"} />
                      <Stat label="Provider" value={trace.provider} />
                      <Stat label="Embeddings" value={trace.embeddingModel} />
                    </dl>

                    {trace.rewrittenAs && (
                      <p className="mt-3 text-xs text-muted">
                        Retried as: <span className="text-body">{trace.rewrittenAs}</span>
                      </p>
                    )}
                    {trace.refusalReason && (
                      <p className="mt-3 rounded-lg bg-refusal-tint px-3 py-2 text-xs leading-relaxed text-ink">
                        {trace.refusalReason}
                      </p>
                    )}

                    {trace.retrieved.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1">
                        {trace.retrieved.map((source) => (
                          <li
                            key={source.n}
                            className="flex items-center gap-2 text-xs text-muted"
                          >
                            <span className="tnum font-mono text-[11px]">{source.score.toFixed(3)}</span>
                            <span className="truncate text-body">
                              {source.filename}
                              {source.page ? ` · p${source.page}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
