"use client";

import { useProvider } from "./useProvider";

/**
 * Local vs hosted, in the interface rather than only in the README (ADR-0019).
 *
 * The point isn't configurability — it's that flipping this and watching the
 * answer get slower and less certain *is* the argument ADR-0003 makes. Every
 * answer is stamped with the model that produced it and how long it took, so the
 * trade-off is visible rather than claimed.
 */
export function ProviderToggle() {
  const { provider, setProvider } = useProvider();

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        Inference
      </p>
      <div className="flex items-center gap-1 rounded-full border-[0.5px] border-line bg-surface p-0.5">
        {(["gemini", "ollama"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setProvider(option)}
            aria-pressed={provider === option}
            className={`flex-1 rounded-full px-3 py-1 text-xs transition-colors ${
              provider === option ? "bg-accent-tint text-accent-on-tint" : "text-muted hover:text-ink"
            }`}
          >
            {option === "gemini" ? "Hosted" : "Local"}
          </button>
        ))}
      </div>
      {provider === "ollama" && (
        // Said up front so slowness reads as expected rather than broken, and so
        // the refusals do too. Docker Desktop gives containers no GPU on macOS,
        // so the local path is CPU-bound; the under-answering is a separate and
        // measured problem (ADR-0015, and the eval table in the README).
        <p className="mt-1.5 text-xs leading-snug text-muted">
          Runs on your machine. Nothing leaves it, and answers take tens of seconds. It also
          under-answers: on the eval set it refused all 12 questions it should have answered.
        </p>
      )}
    </div>
  );
}
