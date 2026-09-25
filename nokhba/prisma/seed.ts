/**
 * Seed: realistic demo content + demo accounts.
 *   npm run db:seed          (idempotent: re-running resets demo content)
 * Demo accounts (password for all: Nokhba123!)
 *   sara@nokhba.demo        learner (with progress)
 *   amal.alkaabi@nokhba.demo / khalid.rahman@nokhba.demo / layla.hassan@nokhba.demo  instructors
 *   admin@nokhba.demo       administrator
 *   super@nokhba.demo       super administrator
 *   manager@ada.demo        organization manager (Abu Dhabi Digital Authority — demo org)
 */
import { PrismaClient, type Difficulty, type LessonType, type QuestionType, type AssessmentKind } from "@prisma/client";
import { hash } from "bcryptjs";
import { CATEGORIES } from "../config/site";
import { SKILLS } from "./seed-data/skills";
import { aiFundamentals, mlFundamentals } from "./seed-data/courses-ai";
import { generativeAi, llmsAndAgents, responsibleAi } from "./seed-data/courses-genai";
import { pythonEssentials, dataAnalytics, cyberFoundations, digitalTransformation, cloudFundamentals } from "./seed-data/courses-other";
import { PATHS } from "./seed-data/paths";
import type { SeedCourse } from "./seed-data/types";
import { ACHIEVEMENTS } from "../server/services/achievements";
import { indexCourse } from "../ai/rag/indexer";

const db = new PrismaClient();
const PASSWORD = "Nokhba123!";
const COURSES: SeedCourse[] = [aiFundamentals, mlFundamentals, generativeAi, llmsAndAgents, responsibleAi, pythonEssentials, dataAnalytics, cyberFoundations, digitalTransformation, cloudFundamentals];

const daysAgo = (n: number, hour = 9) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(hour, 0, 0, 0); return d; };
const dateOnly = (n: number) => { const d = daysAgo(n); d.setUTCHours(0, 0, 0, 0); return d; };

async function reset() {
  // Order matters for FKs; deleting users cascades most learner data.
  await db.$transaction([
    db.contentChunk.deleteMany(), db.certificate.deleteMany(), db.projectSubmission.deleteMany(), db.assessmentAttempt.deleteMany(),
    db.learningRecommendation.deleteMany(), db.dailyPlan.deleteMany(), db.programAssignment.deleteMany(), db.roleSkillProfile.deleteMany(),
    db.organizationMember.deleteMany(), db.department.deleteMany(), db.organization.deleteMany(),
    db.learningPathCourse.deleteMany(), db.learningPathSkill.deleteMany(), db.learningPathProgress.deleteMany(), db.learningPath.deleteMany(),
    db.project.deleteMany(), db.assessment.deleteMany(), db.lesson.deleteMany(), db.module.deleteMany(), db.courseReview.deleteMany(), db.course.deleteMany(),
    db.userSkill.deleteMany(), db.skill.deleteMany(), db.courseCategory.deleteMany(), db.userAchievement.deleteMany(), db.achievement.deleteMany(),
    db.announcement.deleteMany(), db.auditLog.deleteMany(), db.analyticsEvent.deleteMany(), db.aiConfig.deleteMany(),
    db.user.deleteMany({ where: { email: { endsWith: ".demo" } } }),
  ]);
}

async function seedUsers(passwordHash: string) {
  const mk = (email: string, name: string, role: "LEARNER" | "INSTRUCTOR" | "COURSE_MANAGER" | "ORG_MANAGER" | "ADMIN" | "SUPER_ADMIN", locale = "en", onboardingDone = true) =>
    db.user.create({ data: { email, name, role, locale, passwordHash, emailVerified: new Date(), onboardingDone, lastActiveAt: new Date(), profile: { create: {} } } });
  const sara = await db.user.create({ data: { email: "sara@nokhba.demo", name: "Sara Al Mansoori", role: "LEARNER", locale: "en", passwordHash, emailVerified: new Date(), onboardingDone: true, lastActiveAt: new Date(),
    profile: { create: { headline: "Policy analyst moving into AI", bio: "Working in public-sector strategy; building applied AI skills to lead a data-driven team.", country: "AE", city: "Abu Dhabi", interests: ["ai", "data", "leadership"], currentLevel: "intermediate", learningGoal: "career", learningStyle: "mixed", weeklyHours: 5, explanationLevel: "standard" } } } });
  const amal = await mk("amal.alkaabi@nokhba.demo", "Dr. Amal Al Kaabi", "INSTRUCTOR");
  const khalid = await mk("khalid.rahman@nokhba.demo", "Khalid Rahman", "INSTRUCTOR");
  const layla = await mk("layla.hassan@nokhba.demo", "Layla Hassan", "INSTRUCTOR");
  const admin = await mk("admin@nokhba.demo", "Noura Al Shamsi", "ADMIN");
  const superAdmin = await mk("super@nokhba.demo", "System Owner", "SUPER_ADMIN");
  const courseManager = await mk("content@nokhba.demo", "Omar Haddad", "COURSE_MANAGER");
  const manager = await mk("manager@ada.demo", "Faisal Al Nuaimi", "ORG_MANAGER");
  const newbie = await mk("new@nokhba.demo", "Maryam Saeed", "LEARNER", "ar", false);
  const employees = await Promise.all([["huda@ada.demo", "Huda Al Ameri"], ["yousef@ada.demo", "Yousef Karim"], ["reem@ada.demo", "Reem Abdullah"], ["ahmed@ada.demo", "Ahmed Al Hammadi"], ["fatima@ada.demo", "Fatima Zayed"]].map(([e, n]) => mk(e, n, "LEARNER", "ar")));
  await db.instructor.createMany({ data: [
    { userId: amal.id, title: "AI strategy lead, former university lecturer", bio: "15 years across academia and government AI programmes.", expertise: ["AI strategy", "Machine learning", "Responsible AI"], rating: 4.8 },
    { userId: khalid.id, title: "Principal engineer, LLM systems", bio: "Built production RAG and agent systems for regulated industries.", expertise: ["LLMs", "RAG", "Security"], rating: 4.9 },
    { userId: layla.id, title: "Data engineering lead", bio: "Turns messy public data into decisions; teaches Python and analytics.", expertise: ["Python", "Data analytics", "Cloud"], rating: 4.7 },
  ] });
  return { sara, amal, khalid, layla, admin, superAdmin, courseManager, manager, newbie, employees };
}

async function seedCatalog(instructorsByEmail: Map<string, string>, authorId: string) {
  const categories = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) categories.set(c.slug, (await db.courseCategory.create({ data: { slug: c.slug, nameEn: c.nameEn, nameAr: c.nameAr, icon: c.icon, order: i } })).id);
  const skills = new Map<string, string>();
  for (const s of SKILLS) skills.set(s.slug, (await db.skill.create({ data: { slug: s.slug, nameEn: s.nameEn, nameAr: s.nameAr, categoryId: categories.get(s.category) } })).id);
  for (const s of SKILLS) if (s.parent) await db.skill.update({ where: { id: skills.get(s.slug)! }, data: { parentId: skills.get(s.parent) } });

  const courseIds = new Map<string, string>();
  const projectIds = new Map<string, string>();
  for (const c of COURSES) {
    const course = await db.course.create({ data: {
      slug: c.slug, titleEn: c.titleEn, titleAr: c.titleAr, summaryEn: c.summaryEn, summaryAr: c.summaryAr, descriptionEn: c.descriptionEn, descriptionAr: c.descriptionAr,
      categoryId: categories.get(c.category)!, instructorId: instructorsByEmail.get(c.instructor), authorId, difficulty: c.difficulty as Difficulty, estimatedHours: c.hours, status: "PUBLISHED", coverGradient: c.cover, isFeatured: !!c.featured,
      outcomesEn: c.outcomesEn, outcomesAr: c.outcomesAr, prerequisitesEn: c.prerequisitesEn ?? [], prerequisitesAr: c.prerequisitesAr ?? [], rating: c.rating ?? 4.6, ratingCount: c.ratingCount ?? 100, enrollmentCount: c.enrollmentCount ?? 500, publishedAt: daysAgo(120),
      skills: { create: c.skills.map((slug, i) => ({ skillId: skills.get(slug)!, weight: i === 0 ? 1.5 : 1 })) },
    } });
    courseIds.set(c.slug, course.id);
    for (const [mi, m] of c.modules.entries()) {
      const mod = await db.module.create({ data: { courseId: course.id, titleEn: m.titleEn, titleAr: m.titleAr, summaryEn: m.summaryEn, summaryAr: m.summaryAr, order: mi } });
      for (const [li, l] of m.lessons.entries()) {
        await db.lesson.create({ data: { moduleId: mod.id, slug: l.slug, titleEn: l.titleEn, titleAr: l.titleAr, type: (l.type ?? "TEXT") as LessonType, order: li, durationMinutes: l.minutes ?? 12, content: l.blocks as never, isFreePreview: !!l.freePreview,
          skills: { create: (l.skills ?? c.skills.slice(0, 1)).map((slug) => ({ skillId: skills.get(slug)! })) } } });
      }
    }
    for (const a of c.assessments ?? []) {
      await db.assessment.create({ data: { courseId: course.id, titleEn: a.titleEn, titleAr: a.titleAr, kind: a.kind as AssessmentKind, timeLimitMinutes: a.timeLimitMinutes, passingScore: a.passingScore ?? 70, questionsPerAttempt: a.questionsPerAttempt,
        questions: { create: a.questions.map((q, qi) => ({ type: (q.type ?? "MULTIPLE_CHOICE") as QuestionType, promptEn: q.promptEn, promptAr: q.promptAr, options: (q.options ?? undefined) as never, answerKey: (q.correct ? { correctOptionIds: q.correct } : { acceptedAnswers: q.accepted ?? [] }) as never, explanationEn: q.explanationEn, explanationAr: q.explanationAr, difficulty: q.difficulty ?? 2, points: q.points ?? 1, order: qi, skillId: q.skill ? skills.get(q.skill) : undefined })) } } });
    }
    for (const p of c.projects ?? []) {
      const project = await db.project.create({ data: { courseId: course.id, slug: p.slug, titleEn: p.titleEn, titleAr: p.titleAr, briefEn: p.briefEn, briefAr: p.briefAr, objectivesEn: p.objectivesEn, objectivesAr: p.objectivesAr, instructionsEn: p.instructionsEn, instructionsAr: p.instructionsAr, deliverablesEn: p.deliverablesEn, deliverablesAr: p.deliverablesAr, resources: (p.resources ?? []) as never, estimatedHours: p.hours ?? 8,
        rubric: { create: { criteria: p.rubric.map((r) => ({ ...r, levels: [{ score: 0, labelEn: "Missing", labelAr: "غير موجود" }, { score: 50, labelEn: "Partial", labelAr: "جزئي" }, { score: 100, labelEn: "Meets specification", labelAr: "يستوفي المواصفات" }] })) as never, passingScore: 70 } } } });
      projectIds.set(p.slug, project.id);
    }
  }

  const pathIds = new Map<string, string>();
  for (const p of PATHS) {
    const roadmap = p.stages.map((s) => ({ key: s.key, kind: s.kind, titleEn: s.titleEn, titleAr: s.titleAr, descriptionEn: s.descriptionEn, descriptionAr: s.descriptionAr, courseIds: s.courseSlugs.map((slug) => courseIds.get(slug)!), projectIds: (s.projectSlugs ?? []).map((slug) => projectIds.get(slug)!).filter(Boolean) }));
    const courseLinks = p.stages.flatMap((s) => s.courseSlugs.map((slug) => ({ slug, stageKey: s.key })));
    const path = await db.learningPath.create({ data: { slug: p.slug, titleEn: p.titleEn, titleAr: p.titleAr, summaryEn: p.summaryEn, summaryAr: p.summaryAr, descriptionEn: p.descriptionEn, descriptionAr: p.descriptionAr, difficulty: p.difficulty as Difficulty, estimatedWeeks: p.weeks, status: "PUBLISHED", coverGradient: p.cover, roadmap: roadmap as never, outcomesEn: p.outcomesEn, outcomesAr: p.outcomesAr,
      courses: { create: courseLinks.map((l, i) => ({ courseId: courseIds.get(l.slug)!, order: i, stageKey: l.stageKey })) },
      skills: { create: p.skills.map((slug) => ({ skillId: skills.get(slug)! })) } } });
    pathIds.set(p.slug, path.id);
  }
  await db.achievement.createMany({ data: ACHIEVEMENTS.map((a) => ({ ...a })) });
  return { categories, skills, courseIds, projectIds, pathIds };
}

async function seedLearnerActivity(userId: string, courseIds: Map<string, string>, pathIds: Map<string, string>) {
  // Sara: enrolled in the AI path; AI Fundamentals complete, ML in progress, Prompt Engineering started.
  const lessonsOf = async (slug: string) => db.lesson.findMany({ where: { module: { courseId: courseIds.get(slug) } }, orderBy: [{ module: { order: "asc" } }, { order: "asc" }], select: { id: true, durationMinutes: true } });
  const enroll = async (slug: string, completedCount: number, startedDaysAgo: number) => {
    const courseId = courseIds.get(slug)!;
    const lessons = await lessonsOf(slug);
    await db.enrollment.create({ data: { userId, courseId, source: "path", enrolledAt: daysAgo(startedDaysAgo), ...(completedCount >= lessons.length ? { status: "COMPLETED", completedAt: daysAgo(startedDaysAgo - lessons.length) } : {}) } });
    for (const [i, l] of lessons.slice(0, completedCount).entries()) {
      const when = daysAgo(Math.max(0, startedDaysAgo - i * 2));
      await db.lessonProgress.create({ data: { userId, lessonId: l.id, status: "completed", percent: 100, secondsSpent: l.durationMinutes * 60, startedAt: when, completedAt: when, knowledgeChecks: { 1: { correct: i % 3 !== 2, answer: 0 } } } });
    }
    if (completedCount < lessons.length && completedCount > 0) {
      const next = lessons[completedCount];
      await db.lessonProgress.create({ data: { userId, lessonId: next.id, status: "in_progress", percent: 40, secondsSpent: 300 } });
    }
    const done = completedCount >= lessons.length;
    await db.courseProgress.create({ data: { userId, courseId, percent: Math.round((100 * Math.min(completedCount, lessons.length)) / lessons.length), lessonsCompleted: Math.min(completedCount, lessons.length), lessonsTotal: lessons.length, lastLessonId: lessons[Math.min(completedCount, lessons.length - 1)]?.id, lastAccessedAt: daysAgo(done ? startedDaysAgo - lessons.length : 0), ...(done ? { completedAt: daysAgo(startedDaysAgo - lessons.length) } : {}) } });
  };
  await enroll("ai-fundamentals", 99, 30);
  await enroll("machine-learning-fundamentals", 3, 14);
  await enroll("generative-ai-and-prompt-engineering", 1, 3);
  await db.learningPathProgress.create({ data: { userId, learningPathId: pathIds.get("ai-generative-ai-professional")!, percent: 25, currentStage: "foundation", startedAt: daysAgo(30) } });

  // Learning sessions: a 9-day streak with realistic minutes, plus earlier activity.
  for (const [i, minutes] of [35, 20, 45, 15, 30, 25, 40, 20, 30].entries()) await db.learningSession.create({ data: { userId, seconds: minutes * 60, date: dateOnly(i), courseId: courseIds.get(i < 3 ? "generative-ai-and-prompt-engineering" : "machine-learning-fundamentals") } });
  for (const i of [12, 13, 15, 18, 19, 22, 25, 26, 29, 30]) await db.learningSession.create({ data: { userId, seconds: 1500, date: dateOnly(i), courseId: courseIds.get("ai-fundamentals") } });

  // A graded quiz attempt (AI Fundamentals) with a topic breakdown.
  const quiz = await db.assessment.findFirst({ where: { courseId: courseIds.get("ai-fundamentals"), kind: "QUIZ" }, include: { questions: true } });
  if (quiz) {
    const attempt = await db.assessmentAttempt.create({ data: { userId, assessmentId: quiz.id, status: "graded", questionOrder: quiz.questions.map((q) => q.id), score: 80, passed: true, startedAt: daysAgo(20), submittedAt: daysAgo(20, 10), topicBreakdown: [{ skill: "machine-learning", nameEn: "Machine Learning", nameAr: "تعلّم الآلة", correct: 2, total: 2 }, { skill: "llms", nameEn: "Large Language Models", nameAr: "النماذج اللغوية الكبيرة", correct: 1, total: 1 }, { skill: "responsible-ai", nameEn: "Responsible AI", nameAr: "الذكاء الاصطناعي المسؤول", correct: 0, total: 1 }, { skill: "artificial-intelligence", nameEn: "Artificial Intelligence", nameAr: "الذكاء الاصطناعي", correct: 1, total: 1 }] } });
    for (const [i, q] of quiz.questions.entries()) {
      const key = q.answerKey as { correctOptionIds?: string[]; acceptedAnswers?: string[] };
      const correct = i !== 3;
      await db.answer.create({ data: { attemptId: attempt.id, questionId: q.id, response: (key.correctOptionIds ? { optionIds: correct ? key.correctOptionIds : ["c"] } : { text: correct ? key.acceptedAnswers?.[0] ?? "" : "not sure" }) as never, isCorrect: correct, score: correct ? 1 : 0 } });
    }
  }
  // Notes, flashcards, a bookmark, notifications.
  const mlLessons = await lessonsOf("machine-learning-fundamentals");
  await db.note.create({ data: { userId, lessonId: mlLessons[1]?.id, title: "Overfitting cues", body: "- Big gap between train and test → variance\n- Leakage: any feature that knows the answer\n- Regularisation trades a little bias for less variance", tags: ["ml", "revision"] } });
  await db.bookmark.create({ data: { userId, lessonId: mlLessons[2]?.id ?? mlLessons[0].id } });
  await db.flashcard.createMany({ data: [
    { userId, lessonId: mlLessons[1]?.id, topic: "Machine Learning", question: "What does a large train/test gap indicate?", answer: "High variance — the model is overfitting.", difficulty: "medium", source: "ai", dueAt: daysAgo(1) },
    { userId, lessonId: mlLessons[2]?.id, topic: "Model Evaluation", question: "Which metric measures how many real positives were caught?", answer: "Recall.", difficulty: "easy", source: "ai", dueAt: daysAgo(0) },
    { userId, lessonId: mlLessons[2]?.id, topic: "Model Evaluation", question: "Why is accuracy misleading for rare events?", answer: "A model predicting the majority class scores high while catching nothing.", difficulty: "medium", source: "ai", dueAt: daysAgo(0), easeFactor: 2.3, intervalDays: 2, repetitions: 1 },
  ] });
  await db.notification.createMany({ data: [
    { userId, kind: "recommendation", titleEn: "New recommendation: Responsible AI & Governance", titleAr: "توصية جديدة: الذكاء الاصطناعي المسؤول والحوكمة", bodyEn: "Strengthens Responsible AI, your weakest skill this month.", bodyAr: "يقوّي الذكاء الاصطناعي المسؤول، أضعف مهاراتك هذا الشهر.", href: "/courses/responsible-ai-and-governance", createdAt: daysAgo(1) },
    { userId, kind: "deadline", titleEn: "Project due in 5 days: Model evaluation report", titleAr: "مشروع مستحق خلال ٥ أيام: تقرير تقييم نموذج", href: "/projects", createdAt: daysAgo(0) },
    { userId, kind: "certificate", titleEn: "Certificate earned: AI Fundamentals", titleAr: "حصلت على شهادة: أساسيات الذكاء الاصطناعي", href: "/certificates", readAt: daysAgo(9), createdAt: daysAgo(10) },
  ] });
  // Certificate for the completed course + achievements.
  const cert = await db.certificate.create({ data: { code: "NKB-2026-DEMO01", userId, courseId: courseIds.get("ai-fundamentals")!, titleEn: "AI Fundamentals", titleAr: "أساسيات الذكاء الاصطناعي", learnerName: "Sara Al Mansoori", issuedAt: daysAgo(10), metadata: { finalScore: 88, hours: 8 } } });
  const aiSkills = await db.courseSkill.findMany({ where: { courseId: courseIds.get("ai-fundamentals") } });
  await db.certificateSkill.createMany({ data: aiSkills.map((s) => ({ certificateId: cert.id, skillId: s.skillId })) });
  for (const key of ["first_lesson", "first_course", "streak_7"]) {
    const a = await db.achievement.findUnique({ where: { key } });
    if (a) await db.userAchievement.create({ data: { userId, achievementId: a.id, earnedAt: daysAgo(key === "streak_7" ? 2 : 12) } });
  }
  // Skill scores (derived shape; recomputed live by the skills service as she learns).
  const skillRows = await db.skill.findMany({ where: { slug: { in: ["artificial-intelligence", "machine-learning", "responsible-ai", "llms", "prompt-engineering", "model-evaluation", "generative-ai", "data-analysis", "python"] } } });
  const scores: Record<string, number> = { "artificial-intelligence": 82, "machine-learning": 58, "responsible-ai": 41, llms: 66, "prompt-engineering": 35, "model-evaluation": 52, "generative-ai": 48, "data-analysis": 30, python: 45 };
  await db.userSkill.createMany({ data: skillRows.map((s) => ({ userId, skillId: s.id, score: scores[s.slug] ?? 40, evidence: { lessons: 3, quizAnswers: 4, assessmentAnswers: 0, projects: 0 } })) });
  await db.analyticsEvent.createMany({ data: [10, 8, 6, 4, 2, 1, 0].flatMap((d) => [{ userId, name: "lesson_viewed", createdAt: daysAgo(d) }, { userId, name: "ai_message", properties: { action: "tutor.chat" }, createdAt: daysAgo(d) }]) });
}

async function seedOrganization(managerId: string, employeeIds: string[], adminId: string, courseIds: Map<string, string>, pathIds: Map<string, string>, skills: Map<string, string>) {
  const org = await db.organization.create({ data: { name: "Abu Dhabi Digital Authority (demo)", slug: "ada-demo", industry: "Government", country: "AE", settings: { allowSelfEnroll: true } } });
  const [digital, data, security] = await Promise.all(["Digital Services", "Data & Analytics", "Cybersecurity"].map((name) => db.department.create({ data: { organizationId: org.id, name } })));
  await db.organizationMember.create({ data: { organizationId: org.id, userId: managerId, role: "MANAGER", jobTitle: "Head of Talent Development", departmentId: digital.id } });
  const depts = [digital, data, security, digital, data];
  const titles = ["Product owner", "Data analyst", "Security analyst", "Service designer", "BI developer"];
  for (const [i, id] of employeeIds.entries()) await db.organizationMember.create({ data: { organizationId: org.id, userId: id, role: "MEMBER", jobTitle: titles[i], departmentId: depts[i].id } });
  await db.roleSkillProfile.createMany({ data: [
    { organizationId: org.id, name: "Data analyst", requirements: [{ skillId: skills.get("python"), requiredLevel: 70 }, { skillId: skills.get("data-analysis"), requiredLevel: 75 }, { skillId: skills.get("data-visualization"), requiredLevel: 65 }, { skillId: skills.get("statistics"), requiredLevel: 60 }] },
    { organizationId: org.id, name: "AI product owner", requirements: [{ skillId: skills.get("artificial-intelligence"), requiredLevel: 70 }, { skillId: skills.get("prompt-engineering"), requiredLevel: 65 }, { skillId: skills.get("responsible-ai"), requiredLevel: 70 }, { skillId: skills.get("product-management"), requiredLevel: 60 }] },
    { organizationId: org.id, name: "Security analyst", requirements: [{ skillId: skills.get("cybersecurity-fundamentals"), requiredLevel: 75 }, { skillId: skills.get("threat-modeling"), requiredLevel: 65 }, { skillId: skills.get("incident-response"), requiredLevel: 70 }] },
  ] });
  // Assign programmes to employees and give them some progress.
  const assign = [["python-programming-essentials", 0], ["data-analytics-with-python", 1], ["cybersecurity-foundations", 2], ["ai-fundamentals", 3], ["data-analytics-with-python", 4]] as const;
  for (const [slug, idx] of assign) {
    const userId = employeeIds[idx];
    const courseId = courseIds.get(slug)!;
    await db.programAssignment.create({ data: { organizationId: org.id, userId, assignedById: managerId, courseId, dueDate: daysAgo(-30), status: idx % 2 ? "in_progress" : "assigned" } });
    await db.enrollment.create({ data: { userId, courseId, source: "assigned" } });
    const lessons = await db.lesson.findMany({ where: { module: { courseId } }, orderBy: { order: "asc" }, take: 6, select: { id: true } });
    const done = idx % 2 ? 2 : 0;
    for (const l of lessons.slice(0, done)) await db.lessonProgress.create({ data: { userId, lessonId: l.id, status: "completed", percent: 100, completedAt: daysAgo(3) } });
    await db.courseProgress.create({ data: { userId, courseId, percent: Math.round((100 * done) / Math.max(1, lessons.length)), lessonsCompleted: done, lessonsTotal: lessons.length } });
    if (done) await db.learningSession.create({ data: { userId, seconds: 2400, date: dateOnly(3), courseId } });
  }
  await db.programAssignment.create({ data: { organizationId: org.id, userId: employeeIds[3], assignedById: managerId, learningPathId: pathIds.get("ai-generative-ai-professional")!, dueDate: daysAgo(-120), status: "assigned" } });
  // Skill scores for the skills-gap page.
  const sk = (slug: string) => skills.get(slug)!;
  const rows = [
    [employeeIds[1], { python: 62, "data-analysis": 48, "data-visualization": 40, statistics: 35 }],
    [employeeIds[4], { python: 40, "data-analysis": 55, "data-visualization": 70, statistics: 30 }],
    [employeeIds[2], { "cybersecurity-fundamentals": 68, "threat-modeling": 30, "incident-response": 45 }],
    [employeeIds[0], { "artificial-intelligence": 50, "prompt-engineering": 20, "responsible-ai": 35, "product-management": 65 }],
    [employeeIds[3], { "artificial-intelligence": 30, "service-design": 60 }],
  ] as const;
  for (const [userId, m] of rows) await db.userSkill.createMany({ data: Object.entries(m).map(([slug, score]) => ({ userId, skillId: sk(slug), score })) });
  await db.announcement.createMany({ data: [
    { authorId: adminId, titleEn: "New path: AI & Generative AI Professional", titleAr: "مسار جديد: محترف الذكاء الاصطناعي والذكاء التوليدي", bodyEn: "Eight modules, two projects and a capstone. Enrol from Programs.", bodyAr: "ثماني وحدات ومشروعان ومشروع ختامي. التحق من صفحة البرامج.", audience: "learners", publishedAt: daysAgo(5) },
    { authorId: managerId, organizationId: org.id, titleEn: "Q4 learning goal: 10 hours per person", titleAr: "هدف التعلّم للربع الرابع: ١٠ ساعات لكل فرد", bodyEn: "Complete your assigned course before the end of the quarter.", bodyAr: "أكمل دورتك المعيّنة قبل نهاية الربع.", audience: "org", publishedAt: daysAgo(2) },
  ] });
  return org;
}

async function main() {
  console.log("Resetting demo data…");
  await reset();
  const passwordHash = await hash(PASSWORD, 10);
  console.log("Users…");
  const users = await seedUsers(passwordHash);
  const instructorsByEmail = new Map<string, string>();
  for (const i of await db.instructor.findMany({ include: { user: true } })) instructorsByEmail.set(i.user.email, i.id);
  console.log("Catalogue…");
  const catalog = await seedCatalog(instructorsByEmail, users.courseManager.id);
  console.log("Learner activity…");
  await seedLearnerActivity(users.sara.id, catalog.courseIds, catalog.pathIds);
  console.log("Organization…");
  await seedOrganization(users.manager.id, users.employees.map((e) => e.id), users.admin.id, catalog.courseIds, catalog.pathIds, catalog.skills);
  await db.aiConfig.createMany({ data: [
    { key: "ai.tutorTone", value: "warm", description: "Tutor tone: warm | concise | formal" },
    { key: "ai.ragTopK", value: 6, description: "Retrieved chunks per question" },
  ] });
  console.log("Indexing content for RAG…");
  let chunks = 0;
  for (const id of catalog.courseIds.values()) chunks += await indexCourse(id);
  const counts = { courses: await db.course.count(), lessons: await db.lesson.count(), questions: await db.question.count(), projects: await db.project.count(), paths: await db.learningPath.count(), skills: await db.skill.count(), users: await db.user.count(), chunks };
  console.log("Seeded:", counts);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
