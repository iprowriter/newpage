/**
 * Typed provider failures.
 *
 * A raw upstream body is the wrong thing to put in front of a reader — dumping
 * `{"error":{"code":503,...}}` into the UI tells them something broke without
 * telling them whether it was their fault, whether it will pass, or what to do.
 * Classifying at the boundary means the interface can answer all three.
 */

export type ProviderErrorKind =
  /** Upstream is briefly overloaded. Passes on its own. */
  | "unavailable"
  /** Quota or rate limit. Passes, but on the provider's clock, not ours. */
  | "rate_limited"
  /** Missing or rejected credentials. Never passes without human action. */
  | "auth"
  /** The pinned model no longer exists for this key. Needs a config change. */
  | "model_retired"
  /** The local model has not been pulled. Needs one command. */
  | "model_missing"
  /** The provider could not be reached at all. */
  | "network"
  | "unknown";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  /** Whether trying the same request again could plausibly succeed. */
  readonly retryable: boolean;
  /** What to tell the person who asked the question. */
  readonly userMessage: string;
  /** Provider-supplied wait, when it told us one. Preferred over our guess. */
  readonly retryAfterMs?: number;

  constructor(init: {
    kind: ProviderErrorKind;
    message: string;
    userMessage: string;
    status?: number;
    retryable: boolean;
    retryAfterMs?: number;
  }) {
    super(init.message);
    this.name = "ProviderError";
    this.kind = init.kind;
    this.status = init.status;
    this.retryable = init.retryable;
    this.userMessage = init.userMessage;
    this.retryAfterMs = init.retryAfterMs;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

/**
 * `Retry-After` is either seconds or an HTTP date. Honoured when present, because
 * the provider knows when it will be ready and we are guessing.
 */
export function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get("retry-after");
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
