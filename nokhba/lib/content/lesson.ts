import { z } from "zod";

/** Lesson content blocks (stored as JSON on Lesson.content). Shared by the learning UI, the course builder, RAG indexing and the AI context builder. */
export const lessonBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("video"), url: z.string(), captionEn: z.string().optional(), captionAr: z.string().optional(), durationSeconds: z.number().optional() }),
  z.object({ type: z.literal("text"), markdownEn: z.string(), markdownAr: z.string() }),
  z.object({ type: z.literal("image"), url: z.string(), altEn: z.string(), altAr: z.string(), captionEn: z.string().optional(), captionAr: z.string().optional() }),
  z.object({ type: z.literal("diagram"), mermaid: z.string(), captionEn: z.string().optional(), captionAr: z.string().optional() }),
  z.object({
    type: z.literal("code"),
    language: z.enum(["javascript", "python"]),
    instructionsEn: z.string(),
    instructionsAr: z.string(),
    starterCode: z.string(),
    solution: z.string().optional(),
    /** Each test calls the exported/defined function `entry` with args and compares JSON output. */
    entry: z.string().default("solve"),
    tests: z.array(z.object({ name: z.string(), args: z.array(z.unknown()), expected: z.unknown() })).default([]),
  }),
  z.object({
    type: z.literal("knowledge_check"),
    questionEn: z.string(),
    questionAr: z.string(),
    options: z.array(z.object({ textEn: z.string(), textAr: z.string(), correct: z.boolean(), explanationEn: z.string().optional(), explanationAr: z.string().optional() })).min(2),
  }),
  z.object({ type: z.literal("activity"), promptEn: z.string(), promptAr: z.string(), minutes: z.number().optional() }),
  z.object({ type: z.literal("file"), url: z.string(), labelEn: z.string(), labelAr: z.string(), sizeKb: z.number().optional() }),
  z.object({ type: z.literal("interactive"), kind: z.enum(["flip_cards", "steps", "sorter"]), dataEn: z.unknown(), dataAr: z.unknown() }),
]);

export type LessonBlock = z.infer<typeof lessonBlockSchema>;
export const lessonContentSchema = z.array(lessonBlockSchema);

export function parseLessonContent(content: unknown): LessonBlock[] {
  const result = lessonContentSchema.safeParse(content);
  return result.success ? result.data : [];
}

/** Plain text of a lesson in one locale — for RAG chunks and AI context. */
export function lessonPlainText(content: unknown, locale: "en" | "ar"): string {
  const blocks = parseLessonContent(content);
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "text": out.push(locale === "ar" ? b.markdownAr : b.markdownEn); break;
      case "video": out.push((locale === "ar" ? b.captionAr : b.captionEn) ?? ""); break;
      case "image": out.push((locale === "ar" ? b.captionAr ?? b.altAr : b.captionEn ?? b.altEn) ?? ""); break;
      case "diagram": out.push((locale === "ar" ? b.captionAr : b.captionEn) ?? ""); break;
      case "code": out.push(locale === "ar" ? b.instructionsAr : b.instructionsEn, "```\n" + b.starterCode + "\n```"); break;
      case "knowledge_check": out.push((locale === "ar" ? b.questionAr : b.questionEn) + "\n" + b.options.map((o) => `- ${locale === "ar" ? o.textAr : o.textEn}${o.correct ? " (correct)" : ""}`).join("\n")); break;
      case "activity": out.push(locale === "ar" ? b.promptAr : b.promptEn); break;
      case "interactive": out.push(JSON.stringify(locale === "ar" ? b.dataAr : b.dataEn).slice(0, 1500)); break;
      default: break;
    }
  }
  return out.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
}
