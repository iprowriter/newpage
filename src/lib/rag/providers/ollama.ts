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
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const response = await fetch(`${baseUrl}/api/chat`, {
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

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Ollama request failed (${response.status}). Is Ollama running and has "${model}" been pulled? ` +
            `Try: ollama pull ${model}. ${detail.slice(0, 160)}`,
        );
      }

      const body = (await response.json()) as OllamaResponse;
      return {
        text: body.message?.content ?? "",
        promptTokens: body.prompt_eval_count,
        outputTokens: body.eval_count,
      };
    },
  };
}

interface OllamaResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}
