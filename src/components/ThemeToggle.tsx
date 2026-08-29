"use client";

import { useEffect } from "react";

import { useStoredChoice } from "./useStoredChoice";

type Theme = "light" | "dark";

const OPTIONS = ["light", "dark"] as const;

/**
 * The toggle is the only source of truth for theme (ADR-0021). `prefers-color-scheme`
 * is deliberately not consulted, so behaviour is predictable and a reviewer on a
 * dark-mode machine still sees the light design first and the toggle working.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useStoredChoice<Theme>("theme", OPTIONS, "light");

  // The stored value is applied before first paint by the inline script in the
  // layout; this keeps the attribute in step with later changes, including one
  // made in another tab.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="flex items-center gap-1 rounded-full border-[0.5px] border-line bg-surface p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setTheme(option)}
          aria-pressed={theme === option}
          className={`flex-1 rounded-full px-3 py-1 text-xs transition-colors ${
            theme === option ? "bg-accent-tint text-accent-on-tint" : "text-muted hover:text-ink"
          }`}
        >
          {option === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
