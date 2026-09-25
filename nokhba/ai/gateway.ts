import "server-only";
import type { AIProvider, CompletionRequest, CompletionResult, StreamChunk } from "./types";
import { AiError } from "./types";
import { getProvider } from "./providers";
import { getAiSettings } from "./config";
import { LocalDemoProvider } from "./providers/local-demo";

/**
 * ModelGateway: the single door to model providers. Applies admin settings, timeouts,
 * one retry on transient failures and a graceful fallback to the demo provider when the
 * configured provider is unavailable (so learning never stalls on an outage).
 */
const TIMEOUT_MS = 120_000;

async function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiError("timeout", "AI request timed out")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal?.aborted) throw new AiError("unknown", "aborted");
  }
}

async function prepare(req: CompletionRequest): Promise<{ provider: AIProvider; req: CompletionRequest }> {
  const settings = await getAiSettings();
  const provider = await getProvider();
  return { provider, req: { ...req, model: req.model ?? settings.model ?? undefined, temperature: req.temperature ?? settings.temperature, maxTokens: req.maxTokens ?? settings.maxTokens } };
}

const transient = (e: unknown) => e instanceof AiError && (e.code === "timeout" || e.code === "rate_limited" || e.code === "provider_unavailable");

export const gateway = {
  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const { provider, req } = await prepare(request);
    try {
      return await withTimeout(provider.complete(req), TIMEOUT_MS, req.signal);
    } catch (e) {
      if (transient(e) && provider.id !== "local") {
        console.warn(`[ai] ${provider.id} failed (${(e as AiError).code}); falling back to demo provider`);
        return new LocalDemoProvider().complete(req);
      }
      throw e;
    }
  },

  async stream(request: CompletionRequest, onDelta: (c: StreamChunk) => void): Promise<CompletionResult> {
    const { provider, req } = await prepare(request);
    let emitted = false;
    try {
      return await withTimeout(provider.stream(req, (c) => { emitted = true; onDelta(c); }), TIMEOUT_MS, req.signal);
    } catch (e) {
      if (!emitted && transient(e) && provider.id !== "local") {
        console.warn(`[ai] ${provider.id} stream failed (${(e as AiError).code}); falling back to demo provider`);
        return new LocalDemoProvider().stream(req, onDelta);
      }
      throw e;
    }
  },

  async status() {
    const provider = await getProvider();
    return { provider: provider.id, label: provider.label, model: provider.defaultModel, ...(await provider.ping()) };
  },
};
