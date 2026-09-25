import "server-only";
import { db } from "@/lib/db";
import type { ChatMessage } from "./types";
import { gateway } from "./gateway";
import { PLATFORM_RULES } from "./prompts/safety";

const WINDOW = 16;      // recent turns sent verbatim
const SUMMARIZE_AT = 24; // when a conversation exceeds this, fold older turns into the summary

/** Load (or create) a conversation for a user and scope. */
export async function getOrCreateConversation(userId: string, kind: string, scope: { courseId?: string | null; lessonId?: string | null; conversationId?: string | null }) {
  if (scope.conversationId) {
    const existing = await db.aiConversation.findFirst({ where: { id: scope.conversationId, userId } });
    if (existing) return existing;
  }
  const found = await db.aiConversation.findFirst({ where: { userId, kind, lessonId: scope.lessonId ?? null, ...(scope.lessonId ? {} : { courseId: scope.courseId ?? null }) }, orderBy: { updatedAt: "desc" } });
  if (found) return found;
  return db.aiConversation.create({ data: { userId, kind, courseId: scope.courseId ?? null, lessonId: scope.lessonId ?? null } });
}

/** Recent turns as chat messages, plus the rolling summary. */
export async function loadMemory(conversationId: string): Promise<{ messages: ChatMessage[]; summary: string | null; total: number }> {
  const [conv, recent, total] = await Promise.all([
    db.aiConversation.findUnique({ where: { id: conversationId }, select: { summary: true } }),
    db.aiMessage.findMany({ where: { conversationId, role: { in: ["user", "assistant"] } }, orderBy: { createdAt: "desc" }, take: WINDOW }),
    db.aiMessage.count({ where: { conversationId } }),
  ]);
  return { messages: recent.reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), summary: conv?.summary ?? null, total };
}

export async function appendMessage(conversationId: string, role: "user" | "assistant" | "system", content: string, metadata?: Record<string, unknown>) {
  const msg = await db.aiMessage.create({ data: { conversationId, role, content, metadata: metadata as never } });
  await db.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  return msg;
}

/** Fold older turns into the summary when the conversation grows (fire-and-forget from the orchestrator). */
export async function maybeSummarize(conversationId: string, locale: "en" | "ar") {
  const total = await db.aiMessage.count({ where: { conversationId } });
  if (total < SUMMARIZE_AT) return;
  const older = await db.aiMessage.findMany({ where: { conversationId, role: { in: ["user", "assistant"] } }, orderBy: { createdAt: "asc" }, take: total - WINDOW });
  if (older.length < 6) return;
  const conv = await db.aiConversation.findUnique({ where: { id: conversationId }, select: { summary: true } });
  const result = await gateway.complete({
    action: "memory.summarize",
    system: `${PLATFORM_RULES}\n\nSummarise the conversation so far in ≤120 words (${locale === "ar" ? "Arabic" : "English"}), keeping the learner's questions, misconceptions and what was explained.${conv?.summary ? ` Existing summary: ${conv.summary}` : ""}`,
    messages: older.map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 1500) })),
    maxTokens: 300,
    context: { locale },
  });
  await db.aiConversation.update({ where: { id: conversationId }, data: { summary: result.text.slice(0, 2000) } });
}
