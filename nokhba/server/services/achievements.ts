import "server-only";
import { db } from "@/lib/db";
import { notify } from "./notifications";
import { track } from "./analytics-events";

/** Achievement catalogue (seeded into Achievement table; keys are stable). */
export const ACHIEVEMENTS = [
  { key: "first_lesson", titleEn: "First Step", titleAr: "الخطوة الأولى", descriptionEn: "Completed your first lesson.", descriptionAr: "أكملت أول درس لك.", icon: "Footprints" },
  { key: "first_course", titleEn: "First Course", titleAr: "أول دورة", descriptionEn: "Completed a full course.", descriptionAr: "أكملت دورة كاملة.", icon: "BookCheck" },
  { key: "streak_7", titleEn: "7-Day Streak", titleAr: "سلسلة ٧ أيام", descriptionEn: "Learned seven days in a row.", descriptionAr: "تعلّمت سبعة أيام متتالية.", icon: "Flame" },
  { key: "streak_30", titleEn: "30-Day Streak", titleAr: "سلسلة ٣٠ يومًا", descriptionEn: "Thirty consecutive days of learning.", descriptionAr: "ثلاثون يومًا متتالية من التعلّم.", icon: "Flame" },
  { key: "lessons_100", titleEn: "100 Lessons", titleAr: "١٠٠ درس", descriptionEn: "Completed one hundred lessons.", descriptionAr: "أكملت مئة درس.", icon: "Layers" },
  { key: "project_master", titleEn: "Project Master", titleAr: "سيّد المشاريع", descriptionEn: "Passed three projects.", descriptionAr: "اجتزت ثلاثة مشاريع.", icon: "FolderCheck" },
  { key: "ai_explorer", titleEn: "AI Explorer", titleAr: "مستكشف الذكاء", descriptionEn: "Had 25 conversations with the AI tutor.", descriptionAr: "أجريت ٢٥ محادثة مع المرشد الذكي.", icon: "Sparkles" },
  { key: "assessment_ace", titleEn: "Assessment Ace", titleAr: "متفوّق الاختبارات", descriptionEn: "Scored 90% or more on a final assessment.", descriptionAr: "حصلت على ٩٠٪ أو أكثر في اختبار نهائي.", icon: "Trophy" },
  { key: "path_complete", titleEn: "Pathfinder", titleAr: "رائد المسار", descriptionEn: "Completed a learning path.", descriptionAr: "أكملت مسارًا تعليميًا.", icon: "Route" },
] as const;

export type AchievementKey = (typeof ACHIEVEMENTS)[number]["key"];

async function award(userId: string, key: AchievementKey) {
  const achievement = await db.achievement.findUnique({ where: { key } });
  if (!achievement) return null;
  const existing = await db.userAchievement.findUnique({ where: { userId_achievementId: { userId, achievementId: achievement.id } } });
  if (existing) return null;
  await db.userAchievement.create({ data: { userId, achievementId: achievement.id } });
  await notify(userId, { kind: "achievement", titleEn: `Achievement unlocked: ${achievement.titleEn}`, titleAr: `إنجاز جديد: ${achievement.titleAr}`, bodyEn: achievement.descriptionEn, bodyAr: achievement.descriptionAr, href: "/profile#achievements" });
  await track(userId, "achievement_earned", { key });
  return achievement;
}

/** Evaluate all rules for a user after a meaningful event. Cheap counts only. */
export async function evaluateAchievements(userId: string, hint?: { streakDays?: number }) {
  const [lessons, courses, projects, aiConversations, aceAttempts, paths] = await Promise.all([
    db.lessonProgress.count({ where: { userId, status: "completed" } }),
    db.courseProgress.count({ where: { userId, completedAt: { not: null } } }),
    db.projectSubmission.count({ where: { userId, status: "PASSED" } }),
    db.aiConversation.count({ where: { userId } }),
    db.assessmentAttempt.count({ where: { userId, score: { gte: 90 }, assessment: { kind: "FINAL" } } }),
    db.learningPathProgress.count({ where: { userId, completedAt: { not: null } } }),
  ]);
  const earned: string[] = [];
  const check = async (cond: boolean, key: AchievementKey) => { if (cond && (await award(userId, key))) earned.push(key); };
  await check(lessons >= 1, "first_lesson");
  await check(courses >= 1, "first_course");
  await check(lessons >= 100, "lessons_100");
  await check(projects >= 3, "project_master");
  await check(aiConversations >= 25, "ai_explorer");
  await check(aceAttempts >= 1, "assessment_ace");
  await check(paths >= 1, "path_complete");
  if (hint?.streakDays !== undefined) {
    await check(hint.streakDays >= 7, "streak_7");
    await check(hint.streakDays >= 30, "streak_30");
  }
  return earned;
}
