import Link from "next/link";

/**
 * The shell both 404s render into.
 *
 * Shared so the two cannot drift. A 404 is still the product — it keeps the
 * sidebar, the theme and the type scale — and the only thing that should differ
 * between the two is what can honestly be said about what was missing.
 */
export function NotFoundPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl px-6 py-24">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">404</p>
      <h1 className="mt-2 text-[22px] font-medium text-ink">{title}</h1>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-body">{children}</div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          href="/"
          className="rounded-full border-[0.5px] border-line bg-surface px-3.5 py-2 text-[13px] text-body shadow-xs transition-colors hover:border-accent hover:text-ink hover:shadow-sm"
        >
          Back to a collection
        </Link>
        <Link
          href="/traces"
          className="rounded-full border-[0.5px] border-line bg-surface px-3.5 py-2 text-[13px] text-body shadow-xs transition-colors hover:border-accent hover:text-ink hover:shadow-sm"
        >
          Open traces
        </Link>
      </div>
    </div>
  );
}
