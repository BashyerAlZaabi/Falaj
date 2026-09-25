/** Shared plain-data types for the learning experience (course home, lesson screen, tutor, code, notes). */

export type LessonStatus = "not_started" | "in_progress" | "completed";

export type OutlineLesson = {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  type: string;
  durationMinutes: number;
  order: number;
  isFreePreview: boolean;
  status: LessonStatus | string;
  percent: number;
  bookmarked?: boolean;
};

export type OutlineModule = {
  id: string;
  titleEn: string;
  titleAr: string;
  summaryEn?: string | null;
  summaryAr?: string | null;
  order: number;
  lessons: OutlineLesson[];
};

export type CourseSummary = {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  coverGradient?: string | null;
  difficulty: string;
  estimatedHours: number;
  offersCertificate: boolean;
};

/** JSON stored on LessonProgress.lastPosition */
export type LastPosition = {
  scrollPercent?: number;
  videoSeconds?: Record<string, number>;
  code?: Record<string, string>;
};

export type KnowledgeCheckState = { correct: boolean; answer: unknown };

export type LessonProgressState = {
  status: LessonStatus | string;
  percent: number;
  secondsSpent: number;
  knowledgeChecks: Record<string, KnowledgeCheckState>;
  lastPosition: LastPosition | null;
};

export type ProgressPayload = {
  secondsDelta?: number;
  percent?: number;
  lastPosition?: LastPosition;
  knowledgeCheck?: { blockIndex: number; correct: boolean; answer: unknown };
};

export type CompleteResult = {
  percent: number;
  lessonsCompleted: number;
  lessonsTotal: number;
  courseDone: boolean;
  certificateId: string | null;
  achievements: Array<{ key: string; titleEn: string; titleAr: string }>;
};

export type ExplanationLevel = "simple" | "standard" | "technical" | "expert";
export type TutorPrefs = { explanationLevel: ExplanationLevel; guidedMode: boolean };

export type TutorHistoryTurn = { id: string; role: "user" | "assistant"; content: string };
export type TutorHistory = { conversationId: string | null; turns: TutorHistoryTurn[] };

export type NoteLessonRef = {
  id: string;
  titleEn: string;
  titleAr: string;
  module: { courseId: string; course: { id: string; slug: string; titleEn: string; titleAr: string } };
};

export type NoteDto = {
  id: string;
  lessonId: string | null;
  title: string | null;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lesson?: NoteLessonRef | null;
};

export type NoteInput = { title?: string | null; body: string; tags?: string[]; lessonId?: string | null };

/** Code runner */
export type CodeLanguage = "javascript" | "python";
export type CodeTest = { name: string; args: unknown[]; expected: unknown };
export type ConsoleLine = { level: "log" | "error" | "warn" | "info"; text: string };
export type TestResult = { name: string; pass: boolean; expected: unknown; actual?: unknown; error?: string };
export type RunResult = { ok: boolean; error?: string; errorCode?: "ENTRY_MISSING" | "TIMEOUT" | "RUNTIME_UNAVAILABLE" | "SYNTAX"; logs: ConsoleLine[]; results: TestResult[]; durationMs: number };
