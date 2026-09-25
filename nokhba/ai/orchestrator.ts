import "server-only";
import type { ZodType } from "zod";
import type { AiAction, ChatMessage, CompletionResult, StreamChunk } from "./types";
import { AiError } from "./types";
import { gateway } from "./gateway";
import { buildContext, type BuildContextInput } from "./context/builder";
import { renderSystemPrompt, TEMPLATE_VERSION } from "./prompts/templates";
import { dataBlock, detectInjection, scrubOutput } from "./prompts/safety";
import { parseStructured } from "./structured";
import { appendMessage, getOrCreateConversation, loadMemory, maybeSummarize } from "./memory";
import { db } from "@/lib/db";

/**
 * AIOrchestrator — the only entry point application code uses.
 *
 *   chat(...)       conversational actions with memory (tutor, companion, code help)
 *   generate(...)   one-shot text (summaries, feedback)
 *   structured(...) one-shot JSON validated by a zod schema, with one repair retry
 *
 * Every call: builds context (user/course/lesson/RAG) → renders the versioned prompt →
 * gateway → logs an AiMessage/AnalyticsEvent with model + template version.
 */
export interface ChatInput extends BuildContextInput {
  kind: "tutor" | "companion" | "code_help" | "search";
  action: AiAction;
  message: string;
  conversationId?: string | null;
  args?: Record<string, unknown>;
  /** Extra untrusted data to show the model (code, notes) — wrapped as data blocks. */
  attachments?: Array<{ tag: "learner_input" | "notes" | "submission"; text: string; label?: string }>;
  extraFacts?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ChatResult {
  conversationId: string;
  messageId: string;
  text: string;
  model: string;
  provider: string;
}

async function track(userId: string, action: AiAction, result: CompletionResult, extra: Record<string, unknown> = {}) {
  await db.analyticsEvent.create({ data: { userId, name: "ai_message", properties: { action, model: result.model, provider: result.provider, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, latencyMs: result.latencyMs, ...extra } } }).catch(() => null);
}

export const orchestrator = {
  /** Streaming chat. `onDelta` receives text as it is produced; resolves with the stored assistant message. */
  async chat(input: ChatInput, onDelta?: (c: StreamChunk) => void): Promise<ChatResult> {
    const conversation = await getOrCreateConversation(input.userId, input.kind, { courseId: input.courseId, lessonId: input.lessonId, conversationId: input.conversationId });
    const memory = await loadMemory(conversation.id);
    const ctx = await buildContext({ ...input, query: input.message, memorySummary: memory.summary });
    const injection = detectInjection(input.message);
    if (injection) await db.auditLog.create({ data: { actorId: input.userId, action: "ai.injection_attempt", targetType: "conversation", targetId: conversation.id, details: { pattern: injection } } }).catch(() => null);

    const attachments = (input.attachments ?? []).map((a) => dataBlock(a.tag, a.text, { label: a.label })).join("\n");
    const userContent = attachments ? `${input.message}\n\n${attachments}` : input.message;
    const messages: ChatMessage[] = [...memory.messages, { role: "user", content: userContent }];
    const system = renderSystemPrompt(input.action, ctx.prompt, input.args);

    await appendMessage(conversation.id, "user", input.message, { injection: injection ?? undefined });
    const run = (fn: typeof gateway.complete | ((r: Parameters<typeof gateway.stream>[0], d: (c: StreamChunk) => void) => Promise<CompletionResult>)) =>
      fn({ action: input.action, system, messages, context: { ...ctx.facts, ...input.args, ...input.extraFacts }, signal: input.signal }, onDelta ?? (() => {}));
    const result = onDelta ? await run(gateway.stream) : await gateway.complete({ action: input.action, system, messages, context: { ...ctx.facts, ...input.args, ...input.extraFacts }, signal: input.signal });
    const text = scrubOutput(result.text);
    const stored = await appendMessage(conversation.id, "assistant", text, { model: result.model, provider: result.provider, promptTemplate: `${input.action}@${TEMPLATE_VERSION}`, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, latencyMs: result.latencyMs, retrievedChunkIds: ctx.retrievedChunkIds, action: input.action });
    await track(input.userId, input.action, result, { conversationId: conversation.id });
    void maybeSummarize(conversation.id, input.locale).catch(() => null);
    return { conversationId: conversation.id, messageId: stored.id, text, model: result.model, provider: result.provider };
  },

  /** One-shot text generation (no conversation memory). */
  async generate(input: BuildContextInput & { action: AiAction; prompt: string; args?: Record<string, unknown>; extraFacts?: Record<string, unknown>; attachments?: ChatInput["attachments"]; maxTokens?: number }): Promise<{ text: string; result: CompletionResult }> {
    const ctx = await buildContext({ ...input, query: input.query ?? input.prompt });
    const attachments = (input.attachments ?? []).map((a) => dataBlock(a.tag, a.text, { label: a.label })).join("\n");
    const result = await gateway.complete({ action: input.action, system: renderSystemPrompt(input.action, ctx.prompt, input.args), messages: [{ role: "user", content: attachments ? `${input.prompt}\n\n${attachments}` : input.prompt }], context: { ...ctx.facts, ...input.args, ...input.extraFacts }, maxTokens: input.maxTokens });
    await track(input.userId, input.action, result);
    return { text: scrubOutput(result.text), result };
  },

  /** One-shot structured output validated by zod. Retries once with the validation error appended. */
  async structured<T>(input: BuildContextInput & { action: AiAction; prompt: string; schema: ZodType<T>; args?: Record<string, unknown>; extraFacts?: Record<string, unknown>; attachments?: ChatInput["attachments"]; maxTokens?: number }): Promise<T> {
    const ctx = await buildContext({ ...input, query: input.query ?? input.prompt });
    const attachments = (input.attachments ?? []).map((a) => dataBlock(a.tag, a.text, { label: a.label })).join("\n");
    const system = renderSystemPrompt(input.action, ctx.prompt, input.args);
    const context = { ...ctx.facts, ...input.args, ...input.extraFacts };
    const messages: ChatMessage[] = [{ role: "user", content: attachments ? `${input.prompt}\n\n${attachments}` : input.prompt }];
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await gateway.complete({ action: input.action, system, messages, json: true, context, maxTokens: input.maxTokens ?? 4000 });
      await track(input.userId, input.action, result, { attempt });
      try {
        return parseStructured(result.text, input.schema);
      } catch (e) {
        lastError = e;
        messages.push({ role: "assistant", content: result.text.slice(0, 4000) }, { role: "user", content: `That was not valid: ${(e as Error).message}. Reply again with ONLY the JSON object, nothing else.` });
      }
    }
    throw lastError instanceof AiError ? lastError : new AiError("invalid_output", "Could not obtain structured output", lastError);
  },
};
