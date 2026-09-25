/**
 * AI layer contracts. UI never touches these directly:
 *   UI → app/api/ai/* (or server actions) → AIOrchestrator → ContextBuilder → PromptManager → ModelGateway → AIProvider
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type AiAction =
  | "tutor.chat"
  | "companion.chat"
  | "tutor.quiz"
  | "tutor.flashcards"
  | "tutor.summary"
  | "plan.daily"
  | "plan.study"
  | "project.review"
  | "assessment.feedback"
  | "assessment.grade_short_answer"
  | "course.generate"
  | "code.help"
  | "notes.tool"
  | "search.answer"
  | "skills.gap"
  | "memory.summarize"
  | "recommend.explain";

export interface CompletionRequest {
  /** Which product action this call serves — lets providers/analytics specialise and the demo provider answer sensibly. */
  action: AiAction;
  system: string;
  messages: ChatMessage[];
  /** Ask for machine-parseable JSON (the prompt already says so; providers may enforce it). */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Structured context the demo provider (and logging) can use. */
  context?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Explicit model override (admin AI config); provider default otherwise. */
  model?: string;
}

export interface CompletionUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  provider: string;
  usage: CompletionUsage;
  latencyMs: number;
  stopReason?: string;
}

export interface StreamChunk {
  delta: string;
}

export interface AIProvider {
  readonly id: string;
  /** Human label for admin screens. */
  readonly label: string;
  readonly defaultModel: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** Streams text deltas; the returned promise resolves with the final result. */
  stream(req: CompletionRequest, onDelta: (chunk: StreamChunk) => void): Promise<CompletionResult>;
  /** Cheap health probe for the admin AI page. */
  ping(): Promise<{ ok: boolean; detail?: string }>;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface RetrievedChunk {
  id: string;
  title: string;
  content: string;
  score: number;
  courseId: string | null;
  lessonId: string | null;
  source: string;
}

export interface VectorStore {
  readonly id: string;
  upsert(chunks: Array<{ id: string; embedding: number[] }>): Promise<void>;
  /** Cosine-similarity search restricted to a scope (course/lesson) when given. */
  search(embedding: number[], opts: { limit: number; courseId?: string | null; lessonId?: string | null; locale?: string }): Promise<RetrievedChunk[]>;
}

export class AiError extends Error {
  constructor(public code: "provider_unavailable" | "rate_limited" | "invalid_output" | "safety" | "timeout" | "unknown", message: string, public cause?: unknown) {
    super(message);
  }
}
