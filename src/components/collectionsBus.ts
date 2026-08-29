"use client";

import { useEffect } from "react";

/**
 * A one-line pub/sub so the sidebar can refresh the moment something changes it.
 *
 * The sidebar previously reloaded only on navigation, which meant ingesting a
 * document left "New chat · Empty" sitting there until you clicked away and back.
 * Lifting collection state into a context or a store would work too; this stays
 * a listener set because the payload is "something changed, refetch" and nothing
 * more — there is no shared state to keep in sync, only a cue to re-read.
 */
const listeners = new Set<() => void>();

/** Call after any mutation that changes what the sidebar shows. */
export function collectionsChanged(): void {
  for (const listener of listeners) listener();
}

export function useCollectionsChanged(onChange: () => void): void {
  useEffect(() => {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, [onChange]);
}
