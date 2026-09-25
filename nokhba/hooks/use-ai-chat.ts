"use client";

import { useCallback, useRef, useState } from "react";
import { streamAi, ApiError } from "@/lib/api";

export type ChatTurn = { id: string; role: "user" | "assistant"; content: string; pending?: boolean; error?: string };

/**
 * Streaming chat state for the tutor, companion and code-help panels.
 * kind decides the conversation scope on the server; scope carries course/lesson ids.
 */
export function useAiChat(opts: { kind: "tutor" | "companion" | "code_help" | "search"; courseId?: string | null; lessonId?: string | null; initial?: ChatTurn[]; conversationId?: string | null; extra?: Record<string, unknown> }) {
  const [turns, setTurns] = useState<ChatTurn[]>(opts.initial ?? []);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(opts.conversationId ?? null);
  const ctl = useRef<AbortController | null>(null);

  const send = useCallback(async (message: string, extra?: Record<string, unknown>) => {
    const text = message.trim();
    if (!text || busy) return;
    const userId = crypto.randomUUID();
    const botId = crypto.randomUUID();
    setTurns((t) => [...t, { id: userId, role: "user", content: text }, { id: botId, role: "assistant", content: "", pending: true }]);
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const result = await streamAi("/api/ai/chat", { kind: opts.kind, message: text, courseId: opts.courseId ?? null, lessonId: opts.lessonId ?? null, conversationId, ...opts.extra, ...extra }, {
        signal: ctl.current.signal,
        onDelta: (delta) => setTurns((t) => t.map((x) => (x.id === botId ? { ...x, content: x.content + delta } : x))),
      });
      if (result.conversationId) setConversationId(result.conversationId);
      setTurns((t) => t.map((x) => (x.id === botId ? { ...x, pending: false, content: x.content || result.text } : x)));
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      setTurns((t) => t.map((x) => (x.id === botId ? { ...x, pending: false, error: aborted ? undefined : e instanceof ApiError ? e.message : "AI request failed" } : x)));
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  }, [busy, conversationId, opts.kind, opts.courseId, opts.lessonId, opts.extra]);

  const stop = useCallback(() => ctl.current?.abort(), []);
  const reset = useCallback(() => { setTurns([]); setConversationId(null); }, []);

  return { turns, busy, send, stop, reset, conversationId };
}
