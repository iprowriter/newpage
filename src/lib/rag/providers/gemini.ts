import { ProviderError, retryAfterMs } from "./errors";
import { withRetry } from "./retry";
import { GEN_AI, withSpan } from "../telemetry";
import type { GenerateRequest, GenerateResult, Provider } from "./types";

/**
 * Gemini, the documented default path (ADR-0009).
 *
 * The reviewer supplies their own key — the free tier is sufficient, and no key
 * is ever committed to this repo.
 */
export function geminiProvider(apiKey: string, model: string): Provider {
  return {
    id: "gemini",
    model,
    generate(request: GenerateRequest): Promise<GenerateResult> {
      // Transient upstream failures are retried here rather than surfaced: a 503
      // from Gemini means the request never reached the model, so a second
      // attempt costs nothing and usually works.
      return withSpan(
        "gen_ai.chat",
        {
          [GEN_AI.system]: "gemini",
          [GEN_AI.operation]: "chat",
          [GEN_AI.requestModel]: model,
          [GEN_AI.temperature]: request.temperature ?? 0.1,
        },
        async (span) => {
          // The span wraps the retry, not each attempt: a caller cares that the
          // call took 4s and succeeded, and the retries are visible as the gap.
          const result = await withRetry(() => call(apiKey, model, request));
          if (result.promptTokens) span.setAttribute(GEN_AI.inputTokens, result.promptTokens);
          if (result.outputTokens) span.setAttribute(GEN_AI.outputTokens, result.outputTokens);
          return result;
        },
      );
    },
  };
}

async function call(
  apiKey: string,
  model: string,
  request: GenerateRequest,
): Promise<GenerateResult> {
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: [{ text: request.user }] }],
          generationConfig: {
            temperature: request.temperature ?? 0.1,
            ...(request.schema
              ? { responseMimeType: "application/json", responseSchema: toGeminiSchema(request.schema) }
              : {}),
          },
        }),
      },
    );
  } catch (cause) {
    throw new ProviderError({
      kind: "network",
      message: `Could not reach Gemini: ${cause instanceof Error ? cause.message : cause}`,
      userMessage: "Could not reach Gemini. Check your connection and try again.",
      retryable: true,
    });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw classify(response, detail, model);
  }

  const body = (await response.json()) as GeminiResponse;
  // Thinking models return their reasoning as parts flagged `thought`. Those are
  // excluded: including them would put chain-of-thought into the answer and,
  // worse, break JSON parsing of structured output.
  const text =
    body.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("") ?? "";

  return {
    text,
    promptTokens: body.usageMetadata?.promptTokenCount,
    outputTokens: body.usageMetadata?.candidatesTokenCount,
  };
}

function classify(response: Response, detail: string, model: string): ProviderError {
  const status = response.status;

  if (status === 503 || status === 500 || status === 502 || status === 504) {
    return new ProviderError({
      kind: "unavailable",
      message: `Gemini is unavailable (${status}): ${detail.slice(0, 200)}`,
      userMessage:
        "Gemini is briefly overloaded. This usually clears in a few seconds — try again, or switch to local inference.",
      status,
      retryable: true,
      retryAfterMs: retryAfterMs(response.headers),
    });
  }

  if (status === 429) {
    return new ProviderError({
      kind: "rate_limited",
      message: `Gemini rate limit (429): ${detail.slice(0, 200)}`,
      userMessage:
        "The Gemini free tier is rate limiting this key. Wait a moment and retry, or switch to local inference.",
      status,
      retryable: true,
      retryAfterMs: retryAfterMs(response.headers),
    });
  }

  // 400 is included on purpose. Google answers an invalid API key with
  // 400 INVALID_ARGUMENT rather than 401, so keying only on 401/403 sends the
  // single most likely setup failure — a mistyped key — down the "unexpected
  // error" path, where the message tells a reviewer nothing they can act on.
  const badKey = /API[_ ]KEY[_ ]INVALID|API key not valid/i.test(detail);
  if (status === 401 || status === 403 || (status === 400 && badKey)) {
    return new ProviderError({
      kind: "auth",
      message: `Gemini rejected the key (${status}): ${detail.slice(0, 200)}`,
      userMessage:
        "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local — a free key takes a " +
        "minute at aistudio.google.com/apikey.",
      status,
      retryable: false,
    });
  }

  if (status === 404 && detail.includes("no longer available")) {
    // Found the hard way: a pinned model can be withdrawn *for new API keys
    // only*, and `models.list` still returns it — so the model looks available
    // right up until the first generateContent call. Pinning is still correct
    // (ADR-0014); what it needs is a failure that names the replacement.
    const suggested = /use models\/([\w.-]+)/.exec(detail)?.[1];
    return new ProviderError({
      kind: "model_retired",
      message: `Gemini model "${model}" retired for new keys.`,
      userMessage:
        `The pinned model "${model}" has been retired for new API keys. ` +
        `Set GEMINI_MODEL${suggested ? ` to "${suggested}"` : " to a current model"} in .env.local.`,
      status,
      retryable: false,
    });
  }

  return new ProviderError({
    kind: "unknown",
    message: `Gemini request failed (${status}): ${detail.slice(0, 240)}`,
    userMessage: `Gemini returned an unexpected error (${status}).`,
    status,
    retryable: false,
  });
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Gemini's responseSchema is OpenAPI-flavoured, not JSON Schema: it wants
 * uppercase type names and rejects `additionalProperties`. Converted here so the
 * rest of the codebase writes one ordinary schema and the vendor difference stays
 * inside the adapter — which is the whole reason the seam exists.
 */
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const convert = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(convert);
    if (node === null || typeof node !== "object") return node;

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "additionalProperties") continue;
      out[key] = key === "type" && typeof value === "string" ? value.toUpperCase() : convert(value);
    }
    return out;
  };
  return convert(schema) as Record<string, unknown>;
}
