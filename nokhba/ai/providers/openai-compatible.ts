import type { AIProvider, CompletionRequest, CompletionResult, StreamChunk } from "../types";
import { AiError } from "../types";

/**
 * Chat-completions provider for OpenAI, Azure OpenAI and local/enterprise models that
 * expose an OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, LiteLLM…).
 * No SDK: plain fetch + SSE, so it works anywhere.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly label: string;
  readonly defaultModel: string;

  constructor(private cfg: { id: "openai" | "azure" | "local-llm"; label: string; baseUrl: string; apiKey?: string; defaultModel: string; azure?: boolean }) {
    this.id = cfg.id;
    this.label = cfg.label;
    this.defaultModel = cfg.defaultModel;
  }

  private url(model: string) {
    if (this.cfg.azure) return `${this.cfg.baseUrl.replace(/\/$/, "")}/openai/deployments/${model}/chat/completions?api-version=2024-10-21`;
    return `${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cfg.apiKey) h[this.cfg.azure ? "api-key" : "Authorization"] = this.cfg.azure ? this.cfg.apiKey : `Bearer ${this.cfg.apiKey}`;
    return h;
  }

  private body(req: CompletionRequest, stream: boolean) {
    return {
      model: req.model || this.defaultModel,
      messages: [{ role: "system", content: req.system }, ...req.messages.filter((m) => m.role !== "system")],
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.4,
      stream,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    };
  }

  private async request(req: CompletionRequest, stream: boolean) {
    const res = await fetch(this.url(req.model || this.defaultModel), { method: "POST", headers: this.headers(), body: JSON.stringify(this.body(req, stream)), signal: req.signal });
    if (res.status === 429) throw new AiError("rate_limited", "Model rate limit reached");
    if (res.status === 401 || res.status === 403) throw new AiError("provider_unavailable", "Model credentials rejected");
    if (!res.ok) throw new AiError("provider_unavailable", `Model endpoint returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();
    const res = await this.request(req, false);
    const data = (await res.json()) as { model?: string; choices: Array<{ message: { content: string }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      model: data.model ?? req.model ?? this.defaultModel,
      provider: this.id,
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
      latencyMs: Date.now() - started,
      stopReason: data.choices?.[0]?.finish_reason,
    };
  }

  async stream(req: CompletionRequest, onDelta: (c: StreamChunk) => void): Promise<CompletionResult> {
    const started = Date.now();
    const res = await this.request(req, true);
    if (!res.body) throw new AiError("provider_unavailable", "No response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let model = req.model ?? this.defaultModel;
    let usage = { inputTokens: 0, outputTokens: 0 };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const payload = line.replace(/^data:\s*/, "").trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as { model?: string; choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
          if (json.model) model = json.model;
          if (json.usage) usage = { inputTokens: json.usage.prompt_tokens ?? 0, outputTokens: json.usage.completion_tokens ?? 0 };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            onDelta({ delta });
          }
        } catch {
          /* ignore keep-alives */
        }
      }
    }
    return { text, model, provider: this.id, usage, latencyMs: Date.now() - started };
  }

  async ping() {
    try {
      const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/models`, { headers: this.headers() });
      return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }
}
