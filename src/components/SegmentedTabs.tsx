"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A segmented control with an indicator that slides between options.
 *
 * The indicator is positioned from measured tab widths rather than assuming
 * equal thirds, so labels of different lengths still line up — and it is
 * measured in a layout effect so it is correct on first paint instead of
 * jumping into place after hydration.
 */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>(`[data-value="${value}"]`);
      if (!active) return;
      setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    };

    measure();
    // Fonts load after first paint and change the measurement, so re-measure on
    // resize rather than trusting a single reading.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      className="relative inline-flex rounded-full border-[0.5px] border-line bg-surface-soft p-1"
    >
      {indicator && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-[left,width] duration-200 ease-out motion-reduce:transition-none"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          data-value={option.value}
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] transition-colors ${
            value === option.value ? "text-ink" : "text-muted hover:text-body"
          }`}
        >
          {option.label}
          {option.badge !== undefined && option.badge > 0 && (
            <span
              className={`rounded-full px-1.5 text-[11px] ${
                value === option.value ? "bg-accent-tint text-accent-on-tint" : "bg-surface text-muted"
              }`}
            >
              {option.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
