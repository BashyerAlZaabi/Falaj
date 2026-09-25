import "server-only";
import { db } from "@/lib/db";

/**
 * Skill scores (0-100) are derived, never edited by hand:
 *   40% lesson coverage (completed lessons tagged with the skill, weighted)
 *   25% quiz/knowledge-check accuracy on questions tagged with the skill
 *   20% assessment scores (questions tagged with the skill)
 *   15% passed projects in courses tagged with the skill
 * Missing evidence for a component redistributes its weight to the others.
 */
export async function recomputeUserSkill(userId: string, skillId: string) {
  const [lessonLinks, completedLessons, answers, projects] = await Promise.all([
    db.lessonSkill.findMany({ where: { skillId }, select: { lessonId: true, weight: true } }),
    db.lessonProgress.findMany({ where: { userId, status: "completed", lesson: { skills: { some: { skillId } } } }, select: { lessonId: true, knowledgeChecks: true } }),
    db.answer.findMany({ where: { attempt: { userId, status: { in: ["submitted", "graded"] } }, question: { skillId } }, select: { isCorrect: true, score: true, attempt: { select: { assessment: { select: { kind: true } } } } } }),
    db.projectSubmission.findMany({ where: { userId, project: { course: { skills: { some: { skillId } } } }, status: { in: ["PASSED", "NEEDS_REVISION", "AI_REVIEWED"] } }, select: { status: true } }),
  ]);

  const parts: Array<{ weight: number; value: number | null }> = [];
  // lessons
  const totalWeight = lessonLinks.reduce((a, l) => a + l.weight, 0);
  if (totalWeight > 0) {
    const done = new Set(completedLessons.map((l) => l.lessonId));
    const doneWeight = lessonLinks.filter((l) => done.has(l.lessonId)).reduce((a, l) => a + l.weight, 0);
    parts.push({ weight: 0.4, value: (100 * doneWeight) / totalWeight });
  } else parts.push({ weight: 0.4, value: null });
  // knowledge checks inside lessons (stored on progress) + quiz answers
  const kc = completedLessons.flatMap((l) => Object.values((l.knowledgeChecks as Record<string, { correct?: boolean }> | null) ?? {}));
  const quiz = answers.filter((a) => ["QUIZ", "PRACTICE"].includes(a.attempt.assessment.kind));
  const quizPool = [...kc.map((k) => (k.correct ? 1 : 0)), ...quiz.map((a) => (a.score ?? (a.isCorrect ? 1 : 0)))];
  parts.push({ weight: 0.25, value: quizPool.length ? (100 * quizPool.reduce((a, b) => a + b, 0)) / quizPool.length : null });
  // formal assessments
  const formal = answers.filter((a) => ["TIMED", "FINAL"].includes(a.attempt.assessment.kind));
  parts.push({ weight: 0.2, value: formal.length ? (100 * formal.reduce((a, x) => a + (x.score ?? (x.isCorrect ? 1 : 0)), 0)) / formal.length : null });
  // projects
  parts.push({ weight: 0.15, value: projects.length ? (100 * projects.filter((p) => p.status === "PASSED").length) / projects.length : null });

  const available = parts.filter((p) => p.value !== null);
  const wsum = available.reduce((a, p) => a + p.weight, 0);
  const score = wsum ? Math.round(available.reduce((a, p) => a + (p.value as number) * (p.weight / wsum), 0)) : 0;
  const evidence = { lessons: completedLessons.length, lessonsTotal: lessonLinks.length, quizAnswers: quizPool.length, assessmentAnswers: formal.length, projects: projects.length, components: parts.map((p) => ({ weight: p.weight, value: p.value === null ? null : Math.round(p.value) })) };

  await db.userSkill.upsert({ where: { userId_skillId: { userId, skillId } }, update: { score, evidence, lastUpdated: new Date() }, create: { userId, skillId, score, evidence } });
  return score;
}

/** Recompute every skill touched by a lesson, course, assessment or project. */
export async function recomputeSkillsFor(userId: string, scope: { lessonId?: string; courseId?: string; assessmentId?: string; projectId?: string }) {
  const skillIds = new Set<string>();
  if (scope.lessonId) (await db.lessonSkill.findMany({ where: { lessonId: scope.lessonId }, select: { skillId: true } })).forEach((s) => skillIds.add(s.skillId));
  if (scope.courseId) (await db.courseSkill.findMany({ where: { courseId: scope.courseId }, select: { skillId: true } })).forEach((s) => skillIds.add(s.skillId));
  if (scope.assessmentId) (await db.question.findMany({ where: { assessmentId: scope.assessmentId, skillId: { not: null } }, select: { skillId: true } })).forEach((q) => q.skillId && skillIds.add(q.skillId));
  if (scope.projectId) {
    const p = await db.project.findUnique({ where: { id: scope.projectId }, select: { course: { select: { skills: { select: { skillId: true } } } } } });
    p?.course?.skills.forEach((s) => skillIds.add(s.skillId));
  }
  const results: Record<string, number> = {};
  for (const id of skillIds) results[id] = await recomputeUserSkill(userId, id);
  return results;
}

export async function getSkillGraph(userId: string) {
  const skills = await db.userSkill.findMany({ where: { userId }, include: { skill: { include: { category: true, parent: true } } }, orderBy: { score: "desc" } });
  return skills.map((s) => ({ id: s.skillId, slug: s.skill.slug, nameEn: s.skill.nameEn, nameAr: s.skill.nameAr, score: s.score, categorySlug: s.skill.category?.slug ?? null, categoryEn: s.skill.category?.nameEn ?? null, categoryAr: s.skill.category?.nameAr ?? null, parentEn: s.skill.parent?.nameEn ?? null, parentAr: s.skill.parent?.nameAr ?? null, evidence: s.evidence, lastUpdated: s.lastUpdated }));
}
