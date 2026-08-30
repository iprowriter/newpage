/**
 * Section and action icons. Inline SVG rather than an icon package: there is a
 * handful of them, they inherit `currentColor` so they track the theme for free,
 * and a dependency for this would be a dependency to keep updated forever.
 */

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M7 2.5v9M2.5 7h9" {...stroke} strokeWidth={1.5} />
    </svg>
  );
}

/** Collections: stacked layers — a curated, shared set. */
export function CollectionIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M7 1.6 12.4 4.3 7 7 1.6 4.3 7 1.6Z" {...stroke} />
      <path d="M1.6 7 7 9.7 12.4 7" {...stroke} />
      <path d="M1.6 9.7 7 12.4 12.4 9.7" {...stroke} />
    </svg>
  );
}

/** Chats: a speech bubble — transient, personal. */
export function ChatIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M12.2 8.2a1.4 1.4 0 0 1-1.4 1.4H4.5L1.8 12.2V3.2a1.4 1.4 0 0 1 1.4-1.4h7.6a1.4 1.4 0 0 1 1.4 1.4v5Z" {...stroke} />
    </svg>
  );
}

export function TraceIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M1.8 10.2 4.9 6.6l2.5 2.1 3.8-5" {...stroke} />
      <circle cx="4.9" cy="6.6" r="1.1" {...stroke} />
      <circle cx="11.2" cy="3.7" r="1.1" {...stroke} />
    </svg>
  );
}

export function TrashIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M2.6 3.9h8.8M5.5 3.9V2.8h3v1.1M4.2 3.9l.5 7h4.6l.5-7" {...stroke} />
    </svg>
  );
}

/**
 * A disclosure chevron, rotated by the caller's `open` state rather than swapped
 * for a second path: the transition is then the affordance, and it is one shape
 * to keep aligned instead of two.
 */
export function ChevronIcon({ open, size = 13 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden
      className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="M3.6 5.4 7 8.8l3.4-3.4" {...stroke} />
    </svg>
  );
}

/**
 * The two reader verdicts.
 *
 * The paths live here rather than inside `AnswerFeedback` because `/traces`
 * renders the same glyphs read-only, and two copies of a hand-tuned path drift
 * the moment one of them is nudged. Drawn at 1.3 rather than the shared 1.4:
 * these carry more corners than the other icons and thicken visibly at this size.
 */
const THUMB: Record<"up" | "down", string> = {
  up: "M4.6 12.4V6.9m0 5.5h5.1a1.2 1.2 0 0 0 1.2-1l.7-4.1a1.2 1.2 0 0 0-1.2-1.4H8.2l.3-2.3a1.1 1.1 0 0 0-2.1-.6L4.6 6.9m0 5.5H2.8V6.9h1.8",
  down: "M9.4 1.6v5.5m0-5.5H4.3a1.2 1.2 0 0 0-1.2 1l-.7 4.1a1.2 1.2 0 0 0 1.2 1.4h2.2l-.3 2.3a1.1 1.1 0 0 0 2.1.6l1.8-3.9m0-5.5h1.8v5.5H9.4",
};

export function ThumbIcon({ verdict, size = 13 }: { verdict: "up" | "down"; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d={THUMB[verdict]}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
