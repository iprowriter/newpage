"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/** Distance from an edge at which we stop calling it "scrolled away". */
const EDGE = 24;

interface Position {
  overflowing: boolean;
  atTop: boolean;
  atBottom: boolean;
}

/**
 * Tracks whether a scroll pane has somewhere to go.
 *
 * Watches content as well as scrolling: an answer arriving changes the scroll
 * height without firing a scroll event, and without the observer the control
 * would appear only once the reader happened to move.
 */
export function useScrollPosition(ref: RefObject<HTMLDivElement | null>): Position {
  const [position, setPosition] = useState<Position>({
    overflowing: false,
    atTop: true,
    atBottom: true,
  });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflowing = el.scrollHeight > el.clientHeight + EDGE;
    setPosition({
      overflowing,
      atTop: el.scrollTop <= EDGE,
      atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - EDGE,
    });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [ref, measure]);

  return position;
}

/**
 * A single control that points wherever there is somewhere to go: down while
 * there is unread content below, up once you have reached the end.
 *
 * One button rather than two, because only one of them is ever the useful action
 * — showing both would mean half the control is always dead.
 */
export function ScrollAffordance({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const { overflowing, atTop, atBottom } = useScrollPosition(scrollRef);

  if (!overflowing) return null;

  const direction = atBottom ? "up" : "down";
  if (direction === "up" && atTop) return null;

  const scroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: direction === "up" ? 0 : el.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="pointer-events-none relative">
      <button
        type="button"
        onClick={scroll}
        aria-label={direction === "up" ? "Scroll to top" : "Scroll to latest"}
        className="pointer-events-auto absolute -top-11 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border-[0.5px] border-line bg-surface text-muted shadow-md hover:border-accent hover:text-accent"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d={direction === "up" ? "M7 11V3M3.4 6.6 7 3l3.6 3.6" : "M7 3v8M3.4 7.4 7 11l3.6-3.6"}
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
