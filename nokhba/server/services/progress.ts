import "server-only";
import { db } from "@/lib/db";
import { recomputeSkillsFor } from "./skills";
import { evaluateAchievements } from "./achievements";
import { track } from "./analytics-events";
import { notify } from "./notifications";
import { issueCourseCertificate } from "./certificates";
import { computeStreak } from "@/ai/context/builder";

/** Enrol a user in a course (idempotent). */
export async function enroll(userId: string, courseId: string, source: "self" | "assigned" | "path" = "self") {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true, status: true, titleEn: true, titleAr: true, modules: { select: { lessons: { select: { id: true } } } } } });
  if (!course) throw new Error("Course not found");
  if (course.status !== "PUBLISHED" && source === "self") throw new Error("Course is not published");
  const lessonsTotal = course.modules.reduce((a, m) => a + m.lessons.length, 0);
  const existing = await db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) return { enrollment: existing, created: false };
  const [enrollment] = await db.$transaction([
    db.enrollment.create({ data: { userId, courseId, source } }),
    db.courseProgress.upsert({ where: { userId_courseId: { userId, courseId } }, update: {}, create: { userId, courseId, lessonsTotal } }),
    db.course.update({ where: { id: courseId }, data: { enrollmentCount: { increment: 1 } } }),
  ]);
  await track(userId, "enrolled", { courseId, source });
  await notify(userId, { kind: "course_update", titleEn: `You're enrolled in ${course.titleEn}`, titleAr: `تم التحاقك بدورة ${course.titleAr}`, href: `/learn/${courseId}` });
  return { enrollment, created: true };
}

/** Ordered lesson list for a course with the learner's completion state. */
export async function courseOutline(userId: string, courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId }, include: { modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" }, select: { id: true, slug: true, titleEn: true, titleAr: true, type: true, durationMinutes: true, order: true, isFreePreview: true } } } } } });
  if (!course) return null;
  const progress = await db.lessonProgress.findMany({ where: { userId, lesson: { module: { courseId } } }, select: { lessonId: true, status: true, percent: true } });
  const map = new Map(progress.map((p) => [p.lessonId, p]));
  const modules = course.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, status: map.get(l.id)?.status ?? "not_started", percent: map.get(l.id)?.percent ?? 0 })) }));
  const flat = modules.flatMap((m) => m.lessons);
  return { course, modules, flat, nextLesson: flat.find((l) => l.status !== "completed") ?? null };
}

/** Record a lesson view / heartbeat (autosave position + time). */
export async function touchLesson(userId: string, lessonId: string, data: { secondsDelta?: number; percent?: number; lastPosition?: unknown; knowledgeCheck?: { blockIndex: number; correct: boolean; answer: unknown } }) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { module: { select: { courseId: true } } } });
  if (!lesson) throw new Error("Lesson not found");
  const courseId = lesson.module.courseId;
  const existing = await db.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
  const kc = { ...((existing?.knowledgeChecks as Record<string, unknown> | null) ?? {}) };
  if (data.knowledgeCheck) kc[String(data.knowledgeCheck.blockIndex)] = { correct: data.knowledgeCheck.correct, answer: data.knowledgeCheck.answer };
  const progress = await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: { secondsSpent: { increment: Math.max(0, Math.min(600, data.secondsDelta ?? 0)) }, ...(data.percent !== undefined && existing?.status !== "completed" ? { percent: Math.max(existing?.percent ?? 0, Math.min(100, data.percent)) } : {}), ...(data.lastPosition !== undefined ? { lastPosition: data.lastPosition as never } : {}), knowledgeChecks: kc as never },
    create: { userId, lessonId, secondsSpent: Math.max(0, data.secondsDelta ?? 0), percent: data.percent ?? 0, lastPosition: (data.lastPosition ?? undefined) as never, knowledgeChecks: kc as never },
  });
  await db.courseProgress.upsert({ where: { userId_courseId: { userId, courseId } }, update: { lastLessonId: lessonId, lastAccessedAt: new Date() }, create: { userId, courseId, lastLessonId: lessonId, lessonsTotal: await db.lesson.count({ where: { module: { courseId } } }) } });
  if (data.secondsDelta) await logLearningTime(userId, data.secondsDelta, { courseId, lessonId });
  if (!existing) await track(userId, "lesson_viewed", { lessonId, courseId });
  if (data.knowledgeCheck) await recomputeSkillsFor(userId, { lessonId });
  return progress;
}

/** Add seconds to today's learning session (streaks, weekly activity, time spent). */
export async function logLearningTime(userId: string, seconds: number, scope: { courseId?: string | null; lessonId?: string | null } = {}) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const existing = await db.learningSession.findFirst({ where: { userId, date: today, lessonId: scope.lessonId ?? null } });
  if (existing) await db.learningSession.update({ where: { id: existing.id }, data: { seconds: { increment: seconds } } });
  else await db.learningSession.create({ data: { userId, date: today, seconds, courseId: scope.courseId ?? null, lessonId: scope.lessonId ?? null } });
}

/** Mark a lesson complete → course progress → skills → achievements → certificate on course completion. */
export async function completeLesson(userId: string, lessonId: string) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { titleEn: true, titleAr: true, module: { select: { courseId: true } } } });
  if (!lesson) throw new Error("Lesson not found");
  const courseId = lesson.module.courseId;
  await db.lessonProgress.upsert({ where: { userId_lessonId: { userId, lessonId } }, update: { status: "completed", percent: 100, completedAt: new Date() }, create: { userId, lessonId, status: "completed", percent: 100, completedAt: new Date() } });
  await db.enrollment.upsert({ where: { userId_courseId: { userId, courseId } }, update: {}, create: { userId, courseId, source: "self" } });
  const [lessonsTotal, lessonsCompleted] = await Promise.all([
    db.lesson.count({ where: { module: { courseId } } }),
    db.lessonProgress.count({ where: { userId, status: "completed", lesson: { module: { courseId } } } }),
  ]);
  const percent = lessonsTotal ? Math.round((100 * lessonsCompleted) / lessonsTotal) : 0;
  const courseDone = lessonsTotal > 0 && lessonsCompleted >= lessonsTotal;
  const prev = await db.courseProgress.findUnique({ where: { userId_courseId: { userId, courseId } } });
  await db.courseProgress.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: { percent, lessonsCompleted, lessonsTotal, lastLessonId: lessonId, lastAccessedAt: new Date(), ...(courseDone && !prev?.completedAt ? { completedAt: new Date() } : {}) },
    create: { userId, courseId, percent, lessonsCompleted, lessonsTotal, lastLessonId: lessonId, ...(courseDone ? { completedAt: new Date() } : {}) },
  });
  await track(userId, "lesson_completed", { lessonId, courseId, percent });
  await recomputeSkillsFor(userId, { lessonId });

  let certificateId: string | null = null;
  if (courseDone && !prev?.completedAt) {
    await db.enrollment.update({ where: { userId_courseId: { userId, courseId } }, data: { status: "COMPLETED", completedAt: new Date() } });
    await track(userId, "course_completed", { courseId });
    await recomputeSkillsFor(userId, { courseId });
    const cert = await issueCourseCertificate(userId, courseId).catch((e) => { console.warn("[certificate]", e); return null; });
    certificateId = cert?.id ?? null;
    await updatePathProgress(userId, courseId);
  }
  const sessions = await db.learningSession.findMany({ where: { userId, date: { gte: new Date(Date.now() - 45 * 86400_000) } }, select: { date: true } });
  const earned = await evaluateAchievements(userId, { streakDays: computeStreak(sessions.map((s) => s.date)) });
  return { percent, lessonsCompleted, lessonsTotal, courseDone, certificateId, achievements: earned };
}

/** Recalculate learning-path progress for every path containing this course. */
export async function updatePathProgress(userId: string, courseId: string) {
  const paths = await db.learningPathCourse.findMany({ where: { courseId }, select: { learningPathId: true } });
  for (const { learningPathId } of paths) {
    const courses = await db.learningPathCourse.findMany({ where: { learningPathId, isRequired: true }, select: { courseId: true, stageKey: true } });
    const done = await db.courseProgress.findMany({ where: { userId, courseId: { in: courses.map((c) => c.courseId) }, completedAt: { not: null } }, select: { courseId: true } });
    const percent = courses.length ? Math.round((100 * done.length) / courses.length) : 0;
    const doneSet = new Set(done.map((d) => d.courseId));
    const currentStage = courses.find((c) => !doneSet.has(c.courseId))?.stageKey ?? null;
    const complete = percent === 100;
    await db.learningPathProgress.upsert({ where: { userId_learningPathId: { userId, learningPathId } }, update: { percent, currentStage, ...(complete ? { completedAt: new Date() } : {}) }, create: { userId, learningPathId, percent, currentStage, ...(complete ? { completedAt: new Date() } : {}) } });
  }
}

/** "Continue learning" cards: latest active courses with next lesson. */
export async function continueLearning(userId: string, take = 3) {
  const rows = await db.courseProgress.findMany({ where: { userId, completedAt: null }, orderBy: { lastAccessedAt: "desc" }, take, include: { course: { select: { id: true, slug: true, titleEn: true, titleAr: true, coverGradient: true, estimatedHours: true, difficulty: true } } } });
  const out = [];
  for (const r of rows) {
    const outline = await courseOutline(userId, r.courseId);
    out.push({ ...r, nextLesson: outline?.nextLesson ?? null });
  }
  return out;
}

export async function learningStats(userId: string) {
  const since = new Date(Date.now() - 7 * 86400_000);
  const [sessions, allSessions, lessonsCompleted, coursesCompleted] = await Promise.all([
    db.learningSession.findMany({ where: { userId, date: { gte: since } }, select: { date: true, seconds: true } }),
    db.learningSession.findMany({ where: { userId }, select: { date: true, seconds: true } }),
    db.lessonProgress.count({ where: { userId, status: "completed" } }),
    db.courseProgress.count({ where: { userId, completedAt: { not: null } } }),
  ]);
  const byDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) byDay[new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10)] = 0;
  for (const s of sessions) { const k = s.date.toISOString().slice(0, 10); if (k in byDay) byDay[k] += s.seconds; }
  return {
    streakDays: computeStreak(allSessions.map((s) => s.date)),
    weekMinutes: Math.round(sessions.reduce((a, s) => a + s.seconds, 0) / 60),
    totalMinutes: Math.round(allSessions.reduce((a, s) => a + s.seconds, 0) / 60),
    lessonsCompleted,
    coursesCompleted,
    weekly: Object.entries(byDay).map(([date, seconds]) => ({ date, minutes: Math.round(seconds / 60) })),
  };
}
