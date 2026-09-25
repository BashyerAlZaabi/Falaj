import { z } from "zod";
import { apiHandler, requireUserApi, HttpError } from "@/lib/auth/session";
import { parseBody } from "@/lib/security/validate";
import { rateLimit, LIMITS } from "@/lib/security/rate-limit";
import { getLocale } from "@/lib/i18n/server";
import { orchestrator } from "@/ai/orchestrator";
import { db } from "@/lib/db";
import { flashcardsSchema, quizSchema, noteConceptsSchema, noteQuestionsSchema, studyPlanSchema } from "@/ai/schemas";
import { lessonPlainText } from "@/lib/content/lesson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/generate — one-shot AI generations that don't need a conversation:
 *  quiz | flashcards | summary | study_plan | notes_tool
 * Feature-specific generations (daily plan, project review, course draft, skills gap)
 * live in their feature routes and call the orchestrator the same way.
 */
const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("quiz"), lessonId: z.string().optional(), courseId: z.string().optional(), count: z.number().int().min(3).max(15).default(5), difficulty: z.number().min(1).max(5).optional(), coding: z.boolean().optional() }),
  z.object({ type: z.literal("flashcards"), lessonId: z.string().optional(), courseId: z.string().optional(), count: z.number().int().min(3).max(20).default(8), save: z.boolean().default(true) }),
  z.object({ type: z.literal("summary"), lessonId: z.string() }),
  z.object({ type: z.literal("study_plan"), weeks: z.number().int().min(1).max(12).default(4), courseId: z.string().optional() }),
  z.object({ type: z.literal("notes_tool"), tool: z.enum(["summarize", "organize", "flashcards", "questions", "concepts", "study_guide"]), notes: z.string().min(10).max(30000), lessonId: z.string().optional(), save: z.boolean().default(false) }),
]);

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUserApi();
  if (!rateLimit(`ai-heavy:${user.id}`, LIMITS.aiHeavy).ok) throw new HttpError(429, "Too many generations. Please wait a minute.");
  const body = await parseBody(req, bodySchema);
  const locale = await getLocale();
  const base = { userId: user.id, locale };

  switch (body.type) {
    case "quiz": {
      const quiz = await orchestrator.structured({ ...base, action: "tutor.quiz", lessonId: body.lessonId ?? null, courseId: body.courseId ?? null, prompt: `Create a ${body.count}-question quiz from the current material.`, schema: quizSchema, args: { count: body.count, difficulty: body.difficulty ?? 2, coding: body.coding ?? false } });
      return Response.json({ quiz });
    }
    case "flashcards": {
      const generated = await orchestrator.structured({ ...base, action: "tutor.flashcards", lessonId: body.lessonId ?? null, courseId: body.courseId ?? null, prompt: `Create ${body.count} flashcards from the current material.`, schema: flashcardsSchema, args: { count: body.count } });
      let saved = 0;
      if (body.save) {
        const rows = await db.flashcard.createManyAndReturn({ data: generated.cards.map((c) => ({ userId: user.id, lessonId: body.lessonId ?? null, topic: c.topic || "General", question: c.question, answer: c.answer, difficulty: c.difficulty, source: "ai" })) });
        saved = rows.length;
      }
      return Response.json({ cards: generated.cards, saved });
    }
    case "summary": {
      const { text } = await orchestrator.generate({ ...base, action: "tutor.summary", lessonId: body.lessonId, prompt: "Summarise this lesson for revision." });
      return Response.json({ text });
    }
    case "study_plan": {
      const plan = await orchestrator.structured({ ...base, action: "plan.study", courseId: body.courseId ?? null, noRetrieval: true, prompt: `Build a ${body.weeks}-week study plan.`, schema: studyPlanSchema, args: { weeks: body.weeks }, extraFacts: { primaryCourseId: body.courseId ?? null } });
      return Response.json({ plan });
    }
    case "notes_tool": {
      const lessonText = body.lessonId ? lessonPlainText((await db.lesson.findUnique({ where: { id: body.lessonId }, select: { content: true } }))?.content, locale) : "";
      const common = { ...base, action: "notes.tool" as const, lessonId: body.lessonId ?? null, noRetrieval: true, args: { tool: body.tool }, extraFacts: { tool: body.tool, notes: body.notes, lessonText: lessonText.slice(0, 4000) }, attachments: [{ tag: "notes" as const, text: body.notes }] };
      if (body.tool === "flashcards") {
        const out = await orchestrator.structured({ ...common, prompt: "Generate flashcards from my notes.", schema: flashcardsSchema });
        if (body.save) await db.flashcard.createMany({ data: out.cards.map((c) => ({ userId: user.id, lessonId: body.lessonId ?? null, topic: c.topic || "Notes", question: c.question, answer: c.answer, difficulty: c.difficulty, source: "note" })) });
        return Response.json({ cards: out.cards });
      }
      if (body.tool === "questions") return Response.json(await orchestrator.structured({ ...common, prompt: "Generate practice questions from my notes.", schema: noteQuestionsSchema }));
      if (body.tool === "concepts") return Response.json(await orchestrator.structured({ ...common, prompt: "Extract the key concepts from my notes.", schema: noteConceptsSchema }));
      const { text } = await orchestrator.generate({ ...common, prompt: body.tool === "summarize" ? "Summarise my notes." : body.tool === "organize" ? "Organise my notes into sections." : "Create a study guide from my notes." });
      return Response.json({ text });
    }
  }
});
