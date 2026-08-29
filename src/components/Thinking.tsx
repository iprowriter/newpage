/**
 * The waiting state.
 *
 * Skeleton lines rather than the word "Thinking…", because the shape of what is
 * coming is itself information: the reader's eye settles where the answer will
 * be instead of re-reading a label.
 *
 * The local path gets an explicit line about the delay. Tens of seconds with no
 * explanation reads as broken, and the honest sentence is cheaper than a user
 * concluding the app has hung (ADR-0003).
 */
export function Thinking({ local }: { local: boolean }) {
  return (
    <div className="rounded-2xl border-[0.5px] border-line bg-surface p-4 shadow-sm">
      <div className="flex gap-3.5">
        <span aria-hidden className="mt-1 w-0.5 shrink-0 rounded-full bg-line" />
        <div className="flex-1" role="status" aria-live="polite">
          <span className="sr-only">Generating an answer</span>
          <span aria-hidden className="skeleton block h-3 w-[92%] rounded-full" />
          <span aria-hidden className="skeleton mt-2.5 block h-3 w-[78%] rounded-full" />
          <span aria-hidden className="skeleton mt-2.5 block h-3 w-[56%] rounded-full" />
        </div>
      </div>
      {local && (
        <p className="mt-3.5 border-t-[0.5px] border-line pt-2.5 text-xs text-muted">
          Running locally on CPU — this takes tens of seconds.
        </p>
      )}
    </div>
  );
}
