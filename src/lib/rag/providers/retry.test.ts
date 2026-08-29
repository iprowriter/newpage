import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderError } from "./errors";
import { withRetry } from "./retry";

/**
 * Retry is the kind of thing that fails silently in both directions: too eager
 * and it turns one bad request into three, plus a wait the reader did not ask
 * for; too timid and the most common failure in the system goes unhandled.
 * Both directions are asserted by counting calls.
 */

const transient = () =>
  new ProviderError({
    kind: "unavailable",
    message: "503",
    userMessage: "Briefly overloaded.",
    retryable: true,
  });

const permanent = () =>
  new ProviderError({
    kind: "auth",
    message: "401",
    userMessage: "Bad key.",
    retryable: false,
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Runs the operation while letting the backoff timers fire. */
async function run<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.catch((error: unknown) => ({ __thrown: error }) as never);
  await vi.runAllTimersAsync();
  const result = (await settled) as T | { __thrown: unknown };
  if (result && typeof result === "object" && "__thrown" in result) throw result.__thrown;
  return result as T;
}

describe("withRetry", () => {
  it("returns immediately when the first attempt succeeds", async () => {
    const operation = vi.fn().mockResolvedValue("ok");

    await expect(run(withRetry(operation))).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and returns the later success", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(transient())
      .mockResolvedValue("recovered");

    await expect(run(withRetry(operation))).resolves.toBe("recovered");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  // The bound. Without it a busy upstream becomes an unbounded loop against a
  // paid API, which is the expensive way for this to go wrong.
  it("gives up after the attempt limit and rethrows the last error", async () => {
    const operation = vi.fn().mockRejectedValue(transient());

    await expect(run(withRetry(operation))).rejects.toThrow(/503/);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("honours a lower attempt limit", async () => {
    const operation = vi.fn().mockRejectedValue(transient());

    await expect(run(withRetry(operation, { attempts: 2 }))).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(2);
  });

  // Retrying a rejected key is three ways to fail slower.
  it("does not retry an error marked non-retryable", async () => {
    const operation = vi.fn().mockRejectedValue(permanent());

    await expect(run(withRetry(operation))).rejects.toThrow(/401/);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does not retry an ordinary error it cannot classify", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(run(withRetry(operation))).rejects.toThrow(/boom/);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("prefers the provider's own retry hint over its computed backoff", async () => {
    const delays: number[] = [];
    const operation = vi
      .fn()
      .mockRejectedValueOnce(
        new ProviderError({
          kind: "rate_limited",
          message: "429",
          userMessage: "Slow down.",
          retryable: true,
          retryAfterMs: 5000,
        }),
      )
      .mockResolvedValue("ok");

    await run(withRetry(operation, { onRetry: (_, delayMs) => delays.push(delayMs) }));

    expect(delays).toEqual([5000]);
  });
});
