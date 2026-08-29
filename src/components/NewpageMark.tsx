/**
 * The Newpage mark, inlined.
 *
 * Inline rather than an <img> to a file in /public: it is 500 bytes, so a
 * separate request costs more than the bytes save, and inlining means it paints
 * with the first frame instead of popping in a moment later. The mark keeps its
 * own brand colours in both themes — recolouring someone's logo to match your
 * palette is how you end up shipping a wrong version of it.
 */
export function NewpageMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Newpage"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fillRule="evenodd" clipRule="evenodd" d="M10.6667 0H21.3333H32L21.3333 10.6667H10.6667H0L10.6667 0Z" fill="#08BDB8"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M21.3281 10.6667V21.3333V32L31.9948 21.3333V10.6667V0L21.3281 10.6667Z" fill="#FFCF36"/>
      <path d="M21.3281 0V10.6667L31.9948 0H21.3281Z" fill="#008C85"/>
      <path d="M21.3281 10.6667H31.9948V0L21.3281 10.6667Z" fill="#FF7F1F"/>
    </svg>
  );
}
