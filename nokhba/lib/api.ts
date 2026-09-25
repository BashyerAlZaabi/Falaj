"use client";

/** Small typed fetch helper for client components. Throws with the server's error message. */
export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Consume a server-sent event stream produced by app/api/ai/chat.
 * onDelta receives text chunks; resolves with the final event payload.
 */
export async function streamAi(path: string, body: unknown, handlers: { onDelta: (delta: string) => void; signal?: AbortSignal }): Promise<{ conversationId?: string; messageId?: string; text: string }> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: handlers.signal });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (err as { error?: string }).error ?? "AI request failed");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let final: { conversationId?: string; messageId?: string } = {};
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      const line = evt.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = JSON.parse(line.slice(5).trim()) as { delta?: string; done?: boolean; error?: string; conversationId?: string; messageId?: string };
      if (payload.error) throw new ApiError(500, payload.error);
      if (payload.delta) {
        text += payload.delta;
        handlers.onDelta(payload.delta);
      }
      if (payload.done) final = payload;
    }
  }
  return { ...final, text };
}
