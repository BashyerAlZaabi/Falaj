import "server-only";
import { db } from "@/lib/db";

/**
 * Runtime AI configuration: defaults from env, overridable by administrators through
 * the AiConfig table (admin › AI settings). Cached for 30 s per process.
 */
export type AiSettings = {
  provider: "anthropic" | "openai" | "azure" | "local";
  model: string | null;               // null → provider default
  temperature: number;
  maxTokens: number;
  effort: "low" | "medium" | "high";  // thinking effort for providers that support it
  tutorTone: "warm" | "concise" | "formal";
  guidedModeDefault: boolean;
  ragEnabled: boolean;
  ragTopK: number;
  embeddingProvider: "local" | "openai" | "voyage";
  vectorBackend: "array" | "pgvector";
  safetyExtra: string;                // extra platform rules appended to every system prompt
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: (process.env.AI_PROVIDER as AiSettings["provider"]) || "local",
  model: process.env.AI_MODEL || null,
  temperature: 0.4,
  maxTokens: 2048,
  effort: "medium",
  tutorTone: "warm",
  guidedModeDefault: false,
  ragEnabled: true,
  ragTopK: 6,
  embeddingProvider: (process.env.EMBEDDING_PROVIDER as AiSettings["embeddingProvider"]) || "local",
  vectorBackend: (process.env.RAG_VECTOR_BACKEND as AiSettings["vectorBackend"]) || "array",
  safetyExtra: "",
};

let cached: { at: number; value: AiSettings } | null = null;

export async function getAiSettings(): Promise<AiSettings> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  const rows = await db.aiConfig.findMany().catch(() => []);
  const overrides: Partial<AiSettings> = {};
  for (const row of rows) {
    const key = row.key.replace(/^ai\./, "") as keyof AiSettings;
    if (key in DEFAULT_AI_SETTINGS) (overrides as Record<string, unknown>)[key] = row.value;
  }
  const value = { ...DEFAULT_AI_SETTINGS, ...overrides };
  cached = { at: Date.now(), value };
  return value;
}

export function invalidateAiSettings() {
  cached = null;
}

export async function setAiSetting<K extends keyof AiSettings>(key: K, value: AiSettings[K], description?: string) {
  await db.aiConfig.upsert({
    where: { key: `ai.${key}` },
    update: { value: value as never, description },
    create: { key: `ai.${key}`, value: value as never, description },
  });
  invalidateAiSettings();
}
