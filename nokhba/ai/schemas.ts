import { z } from "zod";

/** Zod schemas for every structured AI output — shared by actions, API routes and UI types. */
export const quizQuestionSchema = z.object({
  type: z.enum(["multiple_choice", "true_false", "short_answer", "scenario", "coding"]),
  prompt: z.string().min(3),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctOptionIds: z.array(z.string()).optional(),
  acceptedAnswers: z.array(z.string()).optional(),
  explanation: z.string().optional().default(""),
  difficulty: z.number().min(1).max(5).optional().default(2),
  skill: z.string().optional().default(""),
});
export const quizSchema = z.object({ questions: z.array(quizQuestionSchema).min(1) });
export type GeneratedQuiz = z.infer<typeof quizSchema>;

export const flashcardsSchema = z.object({ cards: z.array(z.object({ question: z.string().min(2), answer: z.string().min(1), difficulty: z.enum(["easy", "medium", "hard"]).optional().default("medium"), topic: z.string().optional().default("") })).min(1) });
export type GeneratedFlashcards = z.infer<typeof flashcardsSchema>;

export const dailyPlanSchema = z.object({
  rationale: z.string().default(""),
  items: z.array(z.object({ kind: z.enum(["review", "lesson", "practice", "quiz", "project"]), minutes: z.number().min(5).max(180), title: z.string(), courseId: z.string().nullable().optional(), lessonId: z.string().nullable().optional(), href: z.string() })).min(1),
});
export type DailyPlan = z.infer<typeof dailyPlanSchema>;

export const studyPlanSchema = z.object({ summary: z.string(), weeks: z.array(z.object({ week: z.number(), focus: z.string(), tasks: z.array(z.object({ title: z.string(), minutes: z.number(), courseId: z.string().nullable().optional() })) })) });

export const projectReviewSchema = z.object({
  overall: z.enum(["pass", "revise"]),
  summary: z.string(),
  rubric: z.array(z.object({ criterionId: z.string(), score: z.number(), maxScore: z.number(), feedback: z.string() })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  revision: z.array(z.string()).default([]),
});
export type ProjectReview = z.infer<typeof projectReviewSchema>;

export const shortAnswerGradeSchema = z.object({ score: z.number().min(0).max(1), isCorrect: z.boolean(), feedback: z.string() });

export const generatedCourseSchema = z.object({
  titleEn: z.string(), titleAr: z.string(), summaryEn: z.string(), summaryAr: z.string(), descriptionEn: z.string(), descriptionAr: z.string(),
  outcomesEn: z.array(z.string()), outcomesAr: z.array(z.string()), prerequisitesEn: z.array(z.string()).default([]), prerequisitesAr: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  modules: z.array(z.object({ titleEn: z.string(), titleAr: z.string(), lessons: z.array(z.object({ titleEn: z.string(), titleAr: z.string(), type: z.enum(["TEXT", "VIDEO", "CODE", "INTERACTIVE"]).default("TEXT"), durationMinutes: z.number().default(12), markdownEn: z.string(), markdownAr: z.string() })) })).min(1),
  quizSuggestions: z.array(z.object({ moduleIndex: z.number(), questions: z.array(z.object({ prompt: z.string(), options: z.array(z.string()), correctIndex: z.number() })) })).default([]),
  projects: z.array(z.object({ titleEn: z.string(), titleAr: z.string(), briefEn: z.string(), briefAr: z.string(), deliverablesEn: z.array(z.string()), deliverablesAr: z.array(z.string()) })).default([]),
  finalAssessment: z.object({ titleEn: z.string(), titleAr: z.string(), questions: z.array(z.object({ prompt: z.string(), options: z.array(z.string()), correctIndex: z.number() })) }).optional(),
});
export type GeneratedCourse = z.infer<typeof generatedCourseSchema>;

export const skillsGapSchema = z.object({ summary: z.string(), gaps: z.array(z.object({ skill: z.string(), required: z.number(), current: z.number(), priority: z.enum(["high", "medium", "low"]) })), recommendations: z.array(z.object({ courseId: z.string(), why: z.string() })), planWeeks: z.number() });

export const noteConceptsSchema = z.object({ concepts: z.array(z.object({ term: z.string(), definition: z.string() })) });
export const noteQuestionsSchema = z.object({ questions: z.array(z.object({ prompt: z.string(), answer: z.string() })) });
export const recommendReasonsSchema = z.object({ reasons: z.array(z.object({ courseId: z.string(), reason: z.string() })) });
