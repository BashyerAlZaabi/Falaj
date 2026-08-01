"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * عميل المحادثة — حلقة تنفيذ حتى ٥ دورات (PROMPT §7):
 * tool_use → نفّذ محلياً → tool_result → أعد الإرسال.
 */

export type ContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WireMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

export type AgentReply = {
  content: ContentBlock[];
  stop_reason: string | null;
  error?: string;
};

export const MAX_TOOL_ROUNDS = 5;

export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function callAgent(
  messages: WireMessage[],
  system: string,
  mode: "assistant" | "onboarding" = "assistant",
): Promise<AgentReply> {
  const token = await getAccessToken();
  if (!token) return { content: [], stop_reason: null, error: "الجلسة انتهت — سجّل الدخول من جديد" };

  const res = await fetch("/api/agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, system, mode }),
  });

  const data = (await res.json().catch(() => ({}))) as Partial<AgentReply> & {
    error?: string;
  };
  if (!res.ok) {
    return { content: [], stop_reason: null, error: data.error ?? "تعذّر الاتصال" };
  }
  return {
    content: Array.isArray(data.content) ? data.content : [],
    stop_reason: data.stop_reason ?? null,
  };
}

/** نص كل بلوكات text في رد. */
export function textOf(content: ContentBlock[]): string {
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** بلوكات tool_use المحلية (نتجاهل أدوات الخادم مثل server_tool_use). */
export function localToolUses(content: ContentBlock[]): ContentBlock[] {
  return content.filter((b) => b.type === "tool_use" && b.id && b.name);
}
