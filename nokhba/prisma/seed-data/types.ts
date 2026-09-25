import type { LessonBlock } from "@/lib/content/lesson";

export type SeedLesson = {
  slug: string;
  titleEn: string;
  titleAr: string;
  type?: "VIDEO" | "TEXT" | "INTERACTIVE" | "CODE" | "QUIZ" | "PROJECT";
  minutes?: number;
  skills?: string[]; // skill slugs
  blocks: LessonBlock[];
  freePreview?: boolean;
};

export type SeedModule = { titleEn: string; titleAr: string; summaryEn?: string; summaryAr?: string; lessons: SeedLesson[] };

export type SeedQuestion = {
  type?: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "SCENARIO" | "CODING";
  promptEn: string;
  promptAr: string;
  options?: Array<{ id: string; textEn: string; textAr: string }>;
  correct?: string[];            // option ids
  accepted?: string[];           // short answer accepted phrases
  explanationEn?: string;
  explanationAr?: string;
  difficulty?: number;
  skill?: string;                // skill slug
  points?: number;
};

export type SeedAssessment = { titleEn: string; titleAr: string; kind: "QUIZ" | "PRACTICE" | "TIMED" | "FINAL"; timeLimitMinutes?: number; passingScore?: number; questionsPerAttempt?: number; questions: SeedQuestion[] };

export type SeedProject = {
  slug: string;
  titleEn: string; titleAr: string;
  briefEn: string; briefAr: string;
  objectivesEn: string[]; objectivesAr: string[];
  instructionsEn: string; instructionsAr: string;
  deliverablesEn: string[]; deliverablesAr: string[];
  resources?: Array<{ labelEn: string; labelAr: string; url: string }>;
  hours?: number;
  rubric: Array<{ id: string; titleEn: string; titleAr: string; descriptionEn: string; descriptionAr: string; weight: number }>;
};

export type SeedCourse = {
  slug: string;
  titleEn: string; titleAr: string;
  summaryEn: string; summaryAr: string;
  descriptionEn: string; descriptionAr: string;
  category: string;
  instructor: string; // instructor email
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  hours: number;
  cover: string;
  featured?: boolean;
  outcomesEn: string[]; outcomesAr: string[];
  prerequisitesEn?: string[]; prerequisitesAr?: string[];
  skills: string[];
  modules: SeedModule[];
  assessments?: SeedAssessment[];
  projects?: SeedProject[];
  rating?: number; ratingCount?: number; enrollmentCount?: number;
};

/** Helpers to keep lesson definitions compact. */
export const text = (markdownEn: string, markdownAr: string): LessonBlock => ({ type: "text", markdownEn, markdownAr });
export const video = (url: string, captionEn: string, captionAr: string, durationSeconds = 420): LessonBlock => ({ type: "video", url, captionEn, captionAr, durationSeconds });
export const check = (questionEn: string, questionAr: string, options: Array<[string, string, boolean, string?, string?]>): LessonBlock => ({ type: "knowledge_check", questionEn, questionAr, options: options.map(([textEn, textAr, correct, explanationEn, explanationAr]) => ({ textEn, textAr, correct, explanationEn, explanationAr })) });
export const activity = (promptEn: string, promptAr: string, minutes = 10): LessonBlock => ({ type: "activity", promptEn, promptAr, minutes });
export const diagram = (mermaid: string, captionEn?: string, captionAr?: string): LessonBlock => ({ type: "diagram", mermaid, captionEn, captionAr });
export const code = (opts: { language: "javascript" | "python"; instructionsEn: string; instructionsAr: string; starterCode: string; solution: string; entry?: string; tests: Array<{ name: string; args: unknown[]; expected: unknown }> }): LessonBlock => ({ type: "code", entry: "solve", ...opts });
export const mc = (promptEn: string, promptAr: string, options: Array<[string, string]>, correctIndex: number, explanationEn: string, explanationAr: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  type: "MULTIPLE_CHOICE", promptEn, promptAr, options: options.map(([textEn, textAr], i) => ({ id: "abcd"[i], textEn, textAr })), correct: ["abcd"[correctIndex]], explanationEn, explanationAr, ...extra,
});
export const tf = (promptEn: string, promptAr: string, answer: boolean, explanationEn: string, explanationAr: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  type: "TRUE_FALSE", promptEn, promptAr, options: [{ id: "a", textEn: "True", textAr: "صحيح" }, { id: "b", textEn: "False", textAr: "خطأ" }], correct: [answer ? "a" : "b"], explanationEn, explanationAr, ...extra,
});
export const sa = (promptEn: string, promptAr: string, accepted: string[], explanationEn: string, explanationAr: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({ type: "SHORT_ANSWER", promptEn, promptAr, accepted, explanationEn, explanationAr, ...extra });
