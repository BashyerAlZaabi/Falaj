import "server-only";
import { db } from "@/lib/db";
import type { PromptContext } from "../prompts/templates";
import { dataBlock } from "../prompts/safety";
import { retrieve } from "../rag/retriever";
import { getAiSettings } from "../config";
import { lessonPlainText } from "@/lib/content/lesson";

export interface BuildContextInput {
  userId: string;
  locale: "en" | "ar";
  courseId?: string | null;
  lessonId?: string | null;
  /** Free text used for retrieval (usually the learner's latest message). */
  query?: string;
  /** Skip RAG (e.g. for planning). */
  noRetrieval?: boolean;
  memorySummary?: string | null;
  overrides?: Partial<Pick<PromptContext, "explanationLevel" | "guidedMode">>;
}

export interface BuiltContext {
  prompt: PromptContext;
  /** Flat, serialisable facts for providers (demo provider) and logging. */
  facts: Record<string, unknown>;
  retrievedChunkIds: string[];
}

/**
 * ContextBuilder: gathers user context, course/lesson context, learning history and
 * retrieved content into the PromptContext consumed by PromptManager. Every DB read here
 * is scoped to the requesting user.
 */
export async function buildContext(input: BuildContextInput): Promise<BuiltContext> {
  const settings = await getAiSettings();
  const [user, lesson, course] = await Promise.all([
    db.user.findUnique({
      where: { id: input.userId },
      select: {
        name: true,
        profile: true,
        courseProgress: { where: { completedAt: null }, orderBy: { lastAccessedAt: "desc" }, take: 5, include: { course: { select: { id: true, titleEn: true, titleAr: true } } } },
        skills: { orderBy: { score: "asc" }, include: { skill: { select: { nameEn: true, nameAr: true, slug: true } } } },
        learningSessions: { where: { date: { gte: new Date(Date.now() - 45 * 86400_000) } }, select: { date: true } },
        assignments: { where: { status: { not: "completed" } }, take: 5, include: { course: { select: { titleEn: true, titleAr: true } }, learningPath: { select: { titleEn: true, titleAr: true } } } },
      },
    }),
    input.lessonId
      ? db.lesson.findUnique({ where: { id: input.lessonId }, include: { module: { include: { course: { select: { id: true, titleEn: true, titleAr: true, summaryEn: true, summaryAr: true, difficulty: true } }, lessons: { select: { id: true, order: true }, orderBy: { order: "asc" } } } } } })
      : null,
    input.courseId && !input.lessonId ? db.course.findUnique({ where: { id: input.courseId }, select: { id: true, titleEn: true, titleAr: true, summaryEn: true, summaryAr: true, difficulty: true } }) : null,
  ]);

  const L = (en: string, arText: string) => (input.locale === "ar" ? arText || en : en || arText);
  const streakDays = computeStreak((user?.learningSessions ?? []).map((s) => s.date));
  const skills = user?.skills ?? [];
  const named = (s: (typeof skills)[number]) => ({ name: L(s.skill.nameEn, s.skill.nameAr), score: Math.round(s.score) });
  const weakSkills = skills.filter((s) => s.score < 60).slice(0, 4).map(named);
  const strongSkills = [...skills].sort((a, b) => b.score - a.score).filter((s) => s.score >= 60).slice(0, 4).map(named);
  const activeCourses = (user?.courseProgress ?? []).map((p) => ({ id: p.course.id, title: L(p.course.titleEn, p.course.titleAr), percent: p.percent }));
  const upcoming = (user?.assignments ?? []).map((a) => ({ title: L(a.course?.titleEn ?? a.learningPath?.titleEn ?? "", a.course?.titleAr ?? a.learningPath?.titleAr ?? ""), due: a.dueDate ? a.dueDate.toISOString().slice(0, 10) : null }));

  const courseRow = lesson?.module.course ?? course;
  const lessonText = lesson ? lessonPlainText(lesson.content, input.locale) : "";
  const position = lesson ? `lesson ${lesson.module.lessons.findIndex((l) => l.id === lesson.id) + 1} of ${lesson.module.lessons.length} in module "${L(lesson.module.titleEn, lesson.module.titleAr)}"` : "";

  let retrieved = "";
  let retrievedText = "";
  let retrievedChunkIds: string[] = [];
  if (!input.noRetrieval && settings.ragEnabled) {
    const query = [input.query, lesson ? L(lesson.titleEn, lesson.titleAr) : ""].filter(Boolean).join(" ").trim();
    if (query) {
      const chunks = await retrieve(query, { courseId: courseRow?.id ?? null, lessonId: input.lessonId ?? null, locale: input.locale, limit: settings.ragTopK }).catch(() => []);
      retrievedChunkIds = chunks.map((c) => c.id);
      retrieved = chunks.map((c) => dataBlock("learning_material", c.content, { title: c.title, source: c.source })).join("\n");
      retrievedText = chunks.map((c) => c.content).join("\n");
    }
  }
  // Always give the tutor the current lesson body even if retrieval is off.
  if (lessonText && !retrievedChunkIds.length) {
    retrieved = dataBlock("learning_material", lessonText.slice(0, 6000), { title: lesson ? L(lesson.titleEn, lesson.titleAr) : "lesson" });
  }

  const profile = user?.profile;
  const prompt: PromptContext = {
    locale: input.locale,
    explanationLevel: input.overrides?.explanationLevel ?? ((profile?.explanationLevel as PromptContext["explanationLevel"]) || "standard"),
    guidedMode: input.overrides?.guidedMode ?? (profile?.guidedMode ?? settings.guidedModeDefault),
    tone: settings.tutorTone,
    learner: user
      ? { name: user.name, level: profile?.currentLevel ?? null, goal: profile?.learningGoal ?? null, style: profile?.learningStyle ?? null, weeklyHours: profile?.weeklyHours ?? null, interests: profile?.interests ?? [], streakDays, weakSkills, strongSkills, activeCourses: activeCourses.map(({ title, percent }) => ({ title, percent })), upcoming }
      : null,
    course: courseRow ? { title: L(courseRow.titleEn, courseRow.titleAr), summary: L(courseRow.summaryEn, courseRow.summaryAr), difficulty: courseRow.difficulty.toLowerCase() } : null,
    lesson: lesson ? { title: L(lesson.titleEn, lesson.titleAr), type: lesson.type.toLowerCase(), summaryText: lessonText.slice(0, 600), position } : null,
    retrieved,
    memorySummary: input.memorySummary ?? null,
    extra: settings.safetyExtra,
  };

  const facts: Record<string, unknown> = {
    locale: input.locale,
    learnerName: user?.name ?? null,
    goal: profile?.learningGoal ?? null,
    level: profile?.currentLevel ?? null,
    weeklyHours: profile?.weeklyHours ?? null,
    streakDays,
    weakSkills,
    strongSkills,
    activeCourses,
    guidedMode: prompt.guidedMode,
    explanationLevel: prompt.explanationLevel,
    courseId: courseRow?.id ?? null,
    courseTitle: prompt.course?.title ?? null,
    courseSummary: prompt.course?.summary ?? null,
    lessonId: input.lessonId ?? null,
    lessonTitle: prompt.lesson?.title ?? null,
    lessonText: lessonText.slice(0, 8000),
    retrievedText: retrievedText.slice(0, 8000),
  };

  return { prompt, facts, retrievedChunkIds };
}

/** Consecutive days (ending today or yesterday) with at least one learning session. */
export function computeStreak(dates: Date[]): number {
  const days = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  if (!days.size) return 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
