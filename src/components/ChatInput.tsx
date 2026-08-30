"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

import { MAX_QUESTION_CHARS, QUESTION_COUNTER_FROM } from "@/lib/limits";

const MAX_ROWS = 3;

/**
 * The composer.
 *
 * A textarea that starts one row and grows to three, then scrolls. Three is the
 * point where a growing box stops helping: past that it eats the conversation it
 * is meant to sit beneath, and the text you are writing is no longer the thing
 * you need to see most.
 *
 * The focus ring is on the *wrapper*, not the field. The field is visually inside
 * a bordered container, so a ring drawn on the field itself lands inside that
 * border and reads as a second, smaller box — the affordance belongs on the edge
 * the eye already treats as the control.
 *
 * Length is capped at `MAX_QUESTION_CHARS` by the field's own `maxLength`, which
 * also truncates a paste rather than accepting it and failing at submit. The
 * counter appears only in the last stretch before the limit: shown from the first
 * character it is noise on every question, and shown never, typing simply stops
 * working with nothing on screen to say why. `/api/query` enforces the same
 * number — this is the convenience, not the control.
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  busy: boolean;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Collapse before measuring: scrollHeight never shrinks below the current
    // height, so without this the box can only ever grow.
    el.style.height = "auto";

    const styles = window.getComputedStyle(el);
    const lineHeight = parseFloat(styles.lineHeight) || 22;
    const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const max = lineHeight * MAX_ROWS + padding;

    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, []);

  // Layout effect, not effect: resizing after paint shows one frame at the wrong
  // height, which is visible as a flicker when the field is cleared after a send.
  useLayoutEffect(resize, [value, resize]);

  return (
    <div className="flex items-end gap-2 rounded-2xl border-[0.5px] border-line bg-surface px-3.5 py-2.5 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-accent">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={MAX_QUESTION_CHARS}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line. The composer only grows to
          // three rows, so newlines are an occasional thing rather than the
          // default, and sending is what the key is reached for.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="focus-ring-off scroll-quiet max-h-40 min-w-0 flex-1 resize-none border-0 bg-transparent py-1 text-[15px] leading-[1.5] text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
      />
      {value.length >= QUESTION_COUNTER_FROM && (
        <span
          className={`tnum mb-1.5 shrink-0 text-[11px] ${
            value.length >= MAX_QUESTION_CHARS ? "text-refusal" : "text-muted"
          }`}
          // Announced only when it changes to the limit; a per-keystroke count
          // read aloud is worse than silence.
          aria-live={value.length >= MAX_QUESTION_CHARS ? "polite" : "off"}
        >
          {value.length}/{MAX_QUESTION_CHARS}
        </span>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !value.trim()}
        className="mb-0.5 shrink-0 rounded-xl bg-accent px-3.5 py-1.5 text-[13px] text-white hover:bg-accent-strong disabled:opacity-40"
      >
        {busy ? "Asking…" : "Ask"}
      </button>
    </div>
  );
}
