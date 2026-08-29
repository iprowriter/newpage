import { ProviderError } from "./errors";
import { withRetry } from "./retry";
import { GEN_AI, withSpan } from "../telemetry";
import type { GenerateRequest, GenerateResult, Provider } from "./types";

/**
 * Ollama, the local path (ADR-0003).
 *
 * The model runs natively on the host, never inside the container: Docker
 * Desktop on macOS gives containers no GPU, so an in-container model would be
 * CPU-only and slow enough to define the reviewer's impression of the whole
 * submission.
 *
 * Expected to score worse than Gemini on grounded citation and on refusal
 * discipline. That gap is the point of the comparison, not a defect to hide —
 * it is what "here is what privacy costs you in quality" actually looks like.
 */
export function ollamaProvider(baseUrl: string, model: string): Provider {
  return {
    id: "ollama",
    model,
    generate(request: GenerateRequest): Promise<GenerateResult> {
      // Fewer attempts than the hosted path: a local model failing is almost
      // always a stopped server or an unpulled model, and neither is fixed by
      // waiting. Two attempts covers the one case that is transient — a model
      // being loaded into memory on first use.
      return withSpan(
        "gen_ai.chat",
        {
          [GEN_AI.system]: "ollama",
          [GEN_AI.operation]: "chat",
          [GEN_AI.requestModel]: model,
          [GEN_AI.temperature]: request.temperature ?? 0.1,
        },
        async (span) => {
          const result = await withRetry(() => call(baseUrl, model, request), { attempts: 2 });
          if (result.promptTokens) span.setAttribute(GEN_AI.inputTokens, result.promptTokens);
          if (result.outputTokens) span.setAttribute(GEN_AI.outputTokens, result.outputTokens);
          return result;
        },
      );
    },
  };
}

async function call(
  baseUrl: string,
  model: string,
  request: GenerateRequest,
): Promise<GenerateResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        // Ollama takes JSON Schema directly, no dialect translation needed.
        ...(request.schema ? { format: request.schema } : {}),
        options: { temperature: request.temperature ?? 0.1 },
      }),
    });
  } catch (cause) {
    // Almost always "Ollama is not running". Said plainly, because the raw
    // ECONNREFUSED does not tell a reviewer which of the two providers failed or
    // what to do about it.
    throw new ProviderError({
      kind: "network",
      message: `Could not reach Ollama at ${baseUrl}: ${cause instanceof Error ? cause.message : cause}`,
      userMessage:
        `Could not reach Ollama at ${baseUrl}. Is it running? Start it with \`ollama serve\`, ` +
        "or switch to hosted inference.",
      retryable: false,
    });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const missingModel = response.status === 404 || detail.includes("not found");

    throw new ProviderError({
      kind: missingModel ? "model_missing" : "unavailable",
      message: `Ollama request failed (${response.status}): ${detail.slice(0, 200)}`,
      userMessage: missingModel
        ? `Ollama does not have "${model}". Pull it with: ollama pull ${model}`
        : `Ollama returned an error (${response.status}).`,
      status: response.status,
      retryable: !missingModel && response.status >= 500,
    });
  }

  const body = (await response.json()) as OllamaResponse;
  return {
    text: body.message?.content ?? "",
    promptTokens: body.prompt_eval_count,
    outputTokens: body.eval_count,
  };
}

interface OllamaResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}
