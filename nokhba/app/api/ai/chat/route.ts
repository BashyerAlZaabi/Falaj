import { z } from "zod";
import { apiHandler, requireUserApi, HttpError } from "@/lib/auth/session";
import { parseBody } from "@/lib/security/validate";
import { rateLimit, LIMITS } from "@/lib/security/rate-limit";
import { getLocale } from "@/lib/i18n/server";
import { orchestrator } from "@/ai/orchestrator";
import type { AiAction } from "@/ai/types";
import { AiError } from "@/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["tutor", "companion", "code_help", "search"]),
  message: z.string().min(1).max(6000),
  courseId: z.string().nullable().optional(),
  lessonId: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
  explanationLevel: z.enum(["simple", "standard", "technical", "expert"]).optional(),
  guidedMode: z.boolean().optional(),
  // code help
  code: z.string().max(20000).optional(),
  language: z.string().max(20).optional(),
  mode: z.enum(["hint", "explain", "debug", "solve"]).optional(),
  failingTest: z.string().max(2000).optional(),
});

const ACTION: Record<z.infer<typeof bodySchema>["kind"], AiAction> = { tutor: "tutor.chat", companion: "companion.chat", code_help: "code.help", search: "search.answer" };

/** POST /api/ai/chat — streams SSE: data:{delta} … data:{done,conversationId,messageId} */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUserApi();
  if (!rateLimit(`ai:${user.id}`, LIMITS.ai).ok) throw new HttpError(429, "Too many AI requests. Please wait a moment.");
  const body = await parseBody(req, bodySchema);
  const locale = await getLocale();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal?.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        const result = await orchestrator.chat(
          {
            userId: user.id, locale, kind: body.kind, action: ACTION[body.kind], message: body.message,
            courseId: body.courseId ?? null, lessonId: body.lessonId ?? null, conversationId: body.conversationId ?? null,
            overrides: { explanationLevel: body.explanationLevel, guidedMode: body.guidedMode },
            args: body.kind === "code_help" ? { mode: body.mode ?? "hint" } : undefined,
            attachments: body.code ? [{ tag: "learner_input", text: body.code, label: `code:${body.language ?? "text"}` }] : undefined,
            extraFacts: body.kind === "code_help" ? { mode: body.mode ?? "hint", code: body.code ?? "", failingTest: body.failingTest ?? "" } : undefined,
            signal: abort.signal,
          },
          (chunk) => send({ delta: chunk.delta }),
        );
        send({ done: true, conversationId: result.conversationId, messageId: result.messageId, model: result.model });
      } catch (e) {
        const message = e instanceof AiError ? (e.code === "rate_limited" ? "The AI service is busy. Try again shortly." : e.message) : "AI request failed";
        console.error("[ai/chat]", e);
        send({ error: message });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
});
