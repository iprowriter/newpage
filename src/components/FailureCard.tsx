"use client";

import { useProvider } from "./useProvider";
import type { QueryFailure } from "./types";

/**
 * A failed question, presented as a state rather than a stack trace.
 *
 * Deliberately styled apart from a refusal: a refusal is the system working and
 * uses `--warn`, while this is the system broken and uses `--danger`. Collapsing
 * the two would teach the reader that "I could not find this" and "something
 * went wrong" are the same event, which is the distinction this whole design
 * exists to preserve.
 *
 * Every failure that can be acted on offers the action. A 503 from the hosted
 * model is the moment the local provider is most useful, so that is exactly when
 * the switch is put in front of the reader.
 */
export function FailureCard({
  failure,
  onRetry,
}: {
  failure: QueryFailure;
  onRetry: () => void;
}) {
  const { provider, setProvider } = useProvider();
  const canFallBack =
    provider === "gemini" && (failure.kind === "unavailable" || failure.kind === "rate_limited");

  return (
    <div className="rounded-2xl border-[0.5px] border-danger/35 bg-surface p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-danger">
        {LABEL[failure.kind]}
      </p>
      <p className="mt-2 text-[15px] leading-[1.65] text-ink">{failure.message}</p>

      {(failure.retryable || canFallBack) && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t-[0.5px] border-line pt-3">
          {failure.retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] text-white hover:bg-accent-strong"
            >
              Try again
            </button>
          )}
          {canFallBack && (
            <button
              type="button"
              onClick={() => {
                setProvider("ollama");
                onRetry();
              }}
              className="rounded-lg border-[0.5px] border-line px-3.5 py-1.5 text-[13px] text-body hover:border-accent hover:text-ink"
            >
              Run locally instead
            </button>
          )}
        </div>
      )}

      {failure.retryable && (
        <p className="mt-2.5 text-xs text-muted">
          Already retried automatically with backoff before showing this.
        </p>
      )}
    </div>
  );
}

const LABEL: Record<QueryFailure["kind"], string> = {
  unavailable: "Model unavailable",
  rate_limited: "Rate limited",
  auth: "Authentication failed",
  model_retired: "Model retired",
  model_missing: "Model not installed",
  network: "Could not connect",
  unknown: "Something went wrong",
};
