/**
 * The indeterminate wait.
 *
 * A spinner here rather than the skeleton `Thinking` uses, and the difference is
 * not decorative. A skeleton works for an answer because the *shape* of what is
 * coming is known — three lines of prose, in a card, in that exact spot — so the
 * placeholder tells the eye where to settle. Indexing has no such shape: nothing
 * appears in place of the drop zone when it finishes, the document simply becomes
 * askable. A skeleton would promise a layout that never arrives.
 *
 * `currentColor` so it takes the colour of whatever it sits in, and the track is
 * drawn at low opacity behind the arc so the thing still reads as a control-sized
 * object when `motion-reduce` stops it turning.
 */
export function Spinner({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className="shrink-0 animate-spin motion-reduce:animate-none"
    >
      <circle cx="7" cy="7" r="5.3" stroke="currentColor" strokeWidth="1.4" opacity="0.25" />
      <path
        d="M7 1.7a5.3 5.3 0 0 1 5.3 5.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
