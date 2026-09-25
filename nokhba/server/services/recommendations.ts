import "server-only";
import { db } from "@/lib/db";

/**
 * Recommendation engine (deterministic scoring; the AI explains the top picks).
 * Signals: onboarding interests + goal, skill gaps, learning history (categories of
 * completed/active courses), assessment results, available weekly time, popularity.
 */
export type Recommendation = { courseId: string; kind: "for_you" | "improve_skill" | "next_best"; score: number; reasonEn: string; reasonAr: string; skillSlug?: string };

export async function computeRecommendations(userId: string, limit = 6): Promise<Recommendation[]> {
  const [user, courses, skills] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { profile: true, enrollments: { select: { courseId: true, status: true } }, courseProgress: { select: { courseId: true, percent: true, completedAt: true, course: { select: { categoryId: true } } } }, assessmentAttempts: { where: { status: "graded" }, select: { score: true, assessment: { select: { courseId: true } } } } } }),
    db.course.findMany({ where: { status: "PUBLISHED" }, select: { id: true, categoryId: true, category: { select: { slug: true } }, difficulty: true, estimatedHours: true, enrollmentCount: true, rating: true, titleEn: true, titleAr: true, skills: { select: { skillId: true, weight: true, skill: { select: { slug: true, nameEn: true, nameAr: true } } } }, pathCourses: { select: { learningPathId: true, order: true } } } }),
    db.userSkill.findMany({ where: { userId }, select: { skillId: true, score: true } }),
  ]);
  if (!user) return [];
  const profile = user.profile;
  const enrolled = new Set(user.enrollments.map((e) => e.courseId));
  const completedCats = new Set(user.courseProgress.filter((p) => p.completedAt).map((p) => p.course.categoryId));
  const activeCats = new Set(user.courseProgress.filter((p) => !p.completedAt).map((p) => p.course.categoryId));
  const skillScore = new Map(skills.map((s) => [s.skillId, s.score]));
  const levelRank: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
  const userLevel = levelRank[profile?.currentLevel ?? "beginner"] ?? 0;
  const weekly = profile?.weeklyHours ?? 5;

  const scored: Recommendation[] = [];
  for (const c of courses) {
    if (enrolled.has(c.id)) continue;
    let score = 0;
    const reasonsEn: string[] = [];
    const reasonsAr: string[] = [];
    if (profile?.interests?.includes(c.category.slug)) { score += 30; reasonsEn.push("matches your interests"); reasonsAr.push("يطابق اهتماماتك"); }
    if (completedCats.has(c.categoryId) || activeCats.has(c.categoryId)) { score += 15; reasonsEn.push("continues what you've been learning"); reasonsAr.push("يكمل ما بدأت تعلّمه"); }
    const diffRank = levelRank[c.difficulty.toLowerCase()] ?? 0;
    if (diffRank === userLevel) { score += 15; } else if (diffRank === userLevel + 1) { score += 8; reasonsEn.push("a step up from your level"); reasonsAr.push("خطوة أعلى من مستواك"); } else if (diffRank > userLevel + 1) score -= 15;
    let weakest: { slug: string; nameEn: string; nameAr: string; score: number } | null = null;
    for (const s of c.skills) {
      const cur = skillScore.get(s.skillId);
      if (cur !== undefined && cur < 60 && (!weakest || cur < weakest.score)) weakest = { slug: s.skill.slug, nameEn: s.skill.nameEn, nameAr: s.skill.nameAr, score: cur };
    }
    if (weakest) { score += 25; reasonsEn.push(`strengthens ${weakest.nameEn} (${weakest.score}%)`); reasonsAr.push(`يقوّي ${weakest.nameAr} (${weakest.score}%)`); }
    const weeksNeeded = c.estimatedHours / Math.max(1, weekly);
    if (weeksNeeded <= 6) score += 5; else if (weeksNeeded > 16) score -= 5;
    if (profile?.learningGoal === "certification" && c.pathCourses.length) { score += 5; }
    score += Math.min(10, Math.log10(1 + c.enrollmentCount) * 3) + c.rating;
    const kind: Recommendation["kind"] = weakest ? "improve_skill" : profile?.interests?.includes(c.category.slug) ? "for_you" : "next_best";
    scored.push({ courseId: c.id, kind, score: Math.round(score), reasonEn: reasonsEn.length ? `Recommended because it ${reasonsEn.join(" and ")}.` : "Popular with learners like you.", reasonAr: reasonsAr.length ? `مُقترح لأنه ${reasonsAr.join(" و")}.` : "شائع بين متعلّمين مثلك.", skillSlug: weakest?.slug });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Persist a fresh set (replaces undismissed ones). */
export async function refreshRecommendations(userId: string) {
  const recs = await computeRecommendations(userId, 8);
  await db.$transaction([
    db.learningRecommendation.deleteMany({ where: { userId, dismissedAt: null } }),
    ...recs.map((r) => db.learningRecommendation.create({ data: { userId, courseId: r.courseId, kind: r.kind, reasonEn: r.reasonEn, reasonAr: r.reasonAr, score: r.score, skillSlug: r.skillSlug } })),
  ]);
  return recs;
}

export async function getRecommendations(userId: string) {
  let rows = await db.learningRecommendation.findMany({ where: { userId, dismissedAt: null }, orderBy: { score: "desc" }, include: { course: { select: { id: true, slug: true, titleEn: true, titleAr: true, summaryEn: true, summaryAr: true, difficulty: true, estimatedHours: true, coverGradient: true, category: { select: { slug: true, nameEn: true, nameAr: true } } } } } });
  if (!rows.length) {
    await refreshRecommendations(userId);
    rows = await db.learningRecommendation.findMany({ where: { userId, dismissedAt: null }, orderBy: { score: "desc" }, include: { course: { select: { id: true, slug: true, titleEn: true, titleAr: true, summaryEn: true, summaryAr: true, difficulty: true, estimatedHours: true, coverGradient: true, category: { select: { slug: true, nameEn: true, nameAr: true } } } } } });
  }
  return rows;
}
