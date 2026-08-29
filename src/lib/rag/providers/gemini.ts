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
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const response = await fetch(
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

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        if (response.status === 429) {
          // Distinguished because the free tier's rate limit is the single most
          // likely thing a reviewer hits, and a generic 4xx reads as "broken".
          throw new Error(`Gemini rate limit reached (429). The free tier throttles; wait and retry. ${detail.slice(0, 160)}`);
        }
        if (response.status === 404 && detail.includes("no longer available")) {
          // Found the hard way: a pinned model can be withdrawn *for new API keys
          // only*, and `models.list` still returns it — so the model appears
          // available right up until the first generateContent call. Pinning is
          // still correct (ADR-0014); what it needs is a failure that names the
          // replacement instead of a bare 404 on a reviewer's first run.
          const suggested = /use models\/([\w.-]+)/.exec(detail)?.[1];
          throw new Error(
            `Gemini model "${model}" has been retired for new API keys. ` +
              `Set GEMINI_MODEL${suggested ? ` to "${suggested}"` : " to a current model"} in .env.local.`,
          );
        }
        throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 240)}`);
      }

      const body = (await response.json()) as GeminiResponse;
      // Thinking models return their reasoning as parts flagged `thought`. Those
      // are excluded: including them would put chain-of-thought into the answer
      // and, worse, break JSON parsing of structured output.
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
    },
  };
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
