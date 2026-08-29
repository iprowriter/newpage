"use client";

import { useStoredChoice } from "./useStoredChoice";

export type ProviderId = "gemini" | "ollama";

const OPTIONS = ["gemini", "ollama"] as const;

/**
 * Which provider the *next* question uses. Per-browser rather than server state:
 * it is a viewing preference, and two people trying the demo at once should not
 * fight over each other's setting.
 */
export function useProvider() {
  const [provider, setProvider] = useStoredChoice<ProviderId>("provider", OPTIONS, "gemini");
  return { provider, setProvider };
}
