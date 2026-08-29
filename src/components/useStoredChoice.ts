"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Reads a small, per-browser preference (theme, provider) from localStorage.
 *
 * `useSyncExternalStore` rather than the reflexive read-in-`useEffect`-and-
 * `setState`: localStorage is an external store, and treating it as one avoids
 * the cascading render the lint rule objects to. It also means the server
 * snapshot is explicit, so SSR renders the default and hydration cannot mismatch.
 *
 * The listener set exists because the `storage` event only fires in *other*
 * tabs — a write in this tab has to notify this tab itself. The upside is that
 * changing the theme in one tab now updates every open tab for free.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useStoredChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const read = useCallback((): T => {
    try {
      const stored = localStorage.getItem(key);
      return allowed.includes(stored as T) ? (stored as T) : fallback;
    } catch {
      // Private browsing, or site data blocked. The default is a correct answer.
      return fallback;
    }
  }, [key, allowed, fallback]);

  const value = useSyncExternalStore(subscribe, read, () => fallback);

  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // As above — the choice still applies for this session.
      }
      for (const listener of listeners) listener();
    },
    [key],
  );

  return [value, set];
}
