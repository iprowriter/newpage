import { ProviderError } from "./errors";

/**
 * Retries transient provider failures with exponential backoff and jitter.
 *
 * Worth doing here rather than leaving to the caller: a 503 "high demand" means
 * the request never reached the model, so retrying costs no tokens and no money —
 * it is the cheapest possible fix for the most common failure. Retrying a 400 or
 * a 401 would just be three ways to fail slower, which is why only errors marked
 * retryable are attempted again.
 *
 * Jitter matters even for one user: without it, the rewrite call and the answer
 * call that both failed against a busy model would retry in lockstep and hit the
 * same congested moment together.
 */
const BASE_DELAY_MS = 600;
const MAX_ATTEMPTS = 3;

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; onRetry?: (attempt: number, delayMs: number) => void } = {},
): Promise<T> {
  const attempts = options.attempts ?? MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const retryable = error instanceof ProviderError && error.retryable;
      if (!retryable || attempt === attempts) break;

      const hinted = error instanceof ProviderError ? error.retryAfterMs : undefined;
      // Full jitter over the backoff window rather than a fixed delay: retrying
      // at exactly 600ms, 1200ms, 2400ms is still a thundering herd, just a
      // punctual one.
      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);
      const delayMs = hinted ?? Math.round(backoff / 2 + Math.random() * (backoff / 2));

      options.onRetry?.(attempt, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
