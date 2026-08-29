import { registerOTel } from "@vercel/otel";

/**
 * Registers the OpenTelemetry SDK once, before the server accepts requests.
 *
 * Deliberately configured entirely by environment. There is no exporter wired to
 * a specific vendor and no collector in `docker-compose.yml`, because adding one
 * would take the stack from six services to seven for a demo where traces
 * already render in-app at `/traces` (ADR-0016).
 *
 * What this buys is that the productionisation answer is true rather than
 * aspirational: shipping to Langfuse, Datadog or Honeycomb is
 * `OTEL_EXPORTER_OTLP_ENDPOINT=...` and nothing else. With no endpoint set the
 * SDK records spans and drops them, which costs approximately nothing and keeps
 * the instrumented path identical in dev, in tests and in production.
 */
export function register() {
  registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME ?? "newpage-docs-assistant" });
}
