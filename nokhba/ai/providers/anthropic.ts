import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, CompletionRequest, CompletionResult, StreamChunk } from "../types";
import { AiError } from "../types";

/** Claude via the official SDK. Model and effort come from admin AI settings. */
export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly label = "Anthropic Claude";
  readonly defaultModel = "claude-opus-5";
  private client: Anthropic;

  constructor(private opts: { apiKey: string; effort?: "low" | "medium" | "high" }) {
    this.client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 90_000 });
  }

  private params(req: CompletionRequest) {
    return {
      model: req.model || this.defaultModel,
      max_tokens: req.maxTokens ?? 2048,
      system: req.system,
      thinking: { type: "adaptive" as const },
      output_config: { effort: this.opts.effort ?? "medium" },
      messages: req.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    };
  }

  private wrap(e: unknown): never {
    if (e instanceof Anthropic.RateLimitError) throw new AiError("rate_limited", "Claude is busy, try again shortly", e);
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("provider_unavailable", "Anthropic API key is invalid", e);
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("timeout", "Claude timed out", e);
    if (e instanceof Anthropic.APIError) throw new AiError("provider_unavailable", `Claude error: ${e.message}`, e);
    throw new AiError("unknown", (e as Error)?.message ?? "Unknown AI error", e);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();
    try {
      const res = await this.client.messages.create({ ...this.params(req) }, { signal: req.signal });
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      return { text, model: res.model, provider: this.id, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }, latencyMs: Date.now() - started, stopReason: res.stop_reason ?? undefined };
    } catch (e) {
      this.wrap(e);
    }
  }

  async stream(req: CompletionRequest, onDelta: (c: StreamChunk) => void): Promise<CompletionResult> {
    const started = Date.now();
    try {
      const stream = this.client.messages.stream({ ...this.params(req) }, { signal: req.signal });
      stream.on("text", (delta) => onDelta({ delta }));
      const res = await stream.finalMessage();
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      return { text, model: res.model, provider: this.id, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }, latencyMs: Date.now() - started, stopReason: res.stop_reason ?? undefined };
    } catch (e) {
      this.wrap(e);
    }
  }

  async ping() {
    try {
      await this.client.models.retrieve(this.defaultModel);
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }
}
