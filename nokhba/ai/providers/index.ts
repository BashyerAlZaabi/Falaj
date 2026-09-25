import "server-only";
import type { AIProvider } from "../types";
import { getAiSettings, type AiSettings } from "../config";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { LocalDemoProvider } from "./local-demo";

/** Provider registry — resolved from admin settings + env at call time. */
export function buildProvider(settings: AiSettings): AIProvider {
  switch (settings.provider) {
    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) return new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, effort: settings.effort });
      break;
    case "openai":
      if (process.env.OPENAI_API_KEY) return new OpenAICompatibleProvider({ id: "openai", label: "OpenAI", baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", apiKey: process.env.OPENAI_API_KEY, defaultModel: process.env.OPENAI_MODEL || "gpt-4.1" });
      break;
    case "azure":
      if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) return new OpenAICompatibleProvider({ id: "azure", label: "Azure OpenAI", baseUrl: process.env.AZURE_OPENAI_ENDPOINT, apiKey: process.env.AZURE_OPENAI_API_KEY, defaultModel: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4.1", azure: true });
      break;
    case "local":
      if (process.env.LOCAL_LLM_URL) return new OpenAICompatibleProvider({ id: "local-llm", label: "Local / enterprise LLM", baseUrl: process.env.LOCAL_LLM_URL, apiKey: process.env.LOCAL_LLM_API_KEY, defaultModel: process.env.LOCAL_LLM_MODEL || "llama3.1" });
      break;
  }
  return new LocalDemoProvider();
}

let cachedKey = "";
let cachedProvider: AIProvider | null = null;

export async function getProvider(): Promise<AIProvider> {
  const settings = await getAiSettings();
  const key = `${settings.provider}:${settings.effort}:${settings.model ?? ""}`;
  if (!cachedProvider || cachedKey !== key) {
    cachedProvider = buildProvider(settings);
    cachedKey = key;
  }
  return cachedProvider;
}

export const availableProviders = () => [
  { id: "anthropic", label: "Anthropic Claude", configured: !!process.env.ANTHROPIC_API_KEY },
  { id: "openai", label: "OpenAI", configured: !!process.env.OPENAI_API_KEY },
  { id: "azure", label: "Azure OpenAI", configured: !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) },
  { id: "local", label: process.env.LOCAL_LLM_URL ? "Local / enterprise LLM" : "Built-in demo assistant", configured: true },
];
