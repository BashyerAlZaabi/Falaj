import { z } from "zod";
import { GOALS, LEVELS, STYLES, WEEKLY_HOURS } from "@/config/site";

/**
 * Shared contracts for the authentication + onboarding feature. Safe to import from
 * client and server code (no server-only dependencies). Validation messages are i18n
 * keys resolved with t() on the client and mapped to responses on the server.
 */
export const LOCALES = ["en", "ar"] as const;
export type AuthLocale = (typeof LOCALES)[number];

// ─────────────────────────────────────────────────────────────── passwords

export type PasswordRuleKey = "length" | "number" | "letter" | "mixedCase" | "symbol";
export type PasswordCheck = { key: PasswordRuleKey; ok: boolean; required: boolean };
export type PasswordStrength = { checks: PasswordCheck[]; score: 0 | 1 | 2 | 3 | 4; valid: boolean };

/** Live strength evaluation shared by the sign-up and reset forms. */
export function checkPassword(password: string): PasswordStrength {
  const checks: PasswordCheck[] = [
    { key: "length", ok: password.length >= 8, required: true },
    { key: "number", ok: /\d/.test(password), required: true },
    { key: "letter", ok: /[A-Za-z؀-ۿ]/.test(password), required: true },
    { key: "mixedCase", ok: /[a-z]/.test(password) && /[A-Z]/.test(password), required: false },
    { key: "symbol", ok: /[^A-Za-z0-9\s]/.test(password), required: false },
  ];
  const valid = checks.filter((c) => c.required).every((c) => c.ok);
  let score = 0;
  if (valid) score = 1;
  if (valid && password.length >= 10) score += 1;
  if (valid && checks[3].ok) score += 1;
  if (valid && checks[4].ok && password.length >= 12) score += 1;
  return { checks, score: Math.min(4, score) as PasswordStrength["score"], valid };
}

export const passwordSchema = z
  .string()
  .min(8, "auth.errors.passwordShort")
  .max(200, "auth.errors.passwordLong")
  .regex(/\d/, "auth.errors.passwordNumber")
  .regex(/[A-Za-z؀-ۿ]/, "auth.errors.passwordLetter");

const emailSchema = z.email("common.form.invalidEmail").max(200, "common.form.invalidEmail");

// ──────────────────────────────────────────────────────────────── sign-up

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "auth.errors.nameShort").max(80, "auth.errors.nameLong"),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
    acceptTerms: z.boolean().refine((v) => v === true, "auth.errors.acceptTerms"),
    locale: z.enum(LOCALES).optional(),
  })
  .refine((d) => d.password === d.confirm, { message: "common.form.passwordsMismatch", path: ["confirm"] });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "common.form.required").max(200) });
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ token: z.string().min(10).max(200), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "common.form.passwordsMismatch", path: ["confirm"] });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Result shape every auth server action returns: error/field are i18n keys. */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };

// ───────────────────────────────────────────────────────────── onboarding

/** Interest tiles shown in onboarding → stored as CourseCategory slugs on Profile.interests. */
export const INTEREST_OPTIONS = [
  { key: "ai", slug: "ai" },
  { key: "cybersecurity", slug: "cybersecurity" },
  { key: "data", slug: "data" },
  { key: "programming", slug: "programming" },
  { key: "leadership", slug: "leadership" },
  { key: "digitalTransformation", slug: "digital-transformation" },
  { key: "projectManagement", slug: "business" }, // project-management courses live under the Business category
] as const;
export type InterestKey = (typeof INTEREST_OPTIONS)[number]["key"];

export const LEVEL_OPTIONS = LEVELS;
export const GOAL_OPTIONS = GOALS;
export const STYLE_OPTIONS = STYLES;
export const HOURS_OPTIONS = WEEKLY_HOURS;
export type Level = (typeof LEVELS)[number];
export type Goal = (typeof GOALS)[number];
export type Style = (typeof STYLES)[number];
export type WeeklyHours = (typeof WEEKLY_HOURS)[number];

export const onboardingSchema = z.object({
  displayName: z.string().trim().min(2, "auth.errors.nameShort").max(80, "auth.errors.nameLong"),
  headline: z.string().trim().max(120, "auth.errors.headlineLong").optional().default(""),
  locale: z.enum(LOCALES),
  interests: z.array(z.string().min(1).max(40)).min(1, "auth.errors.pickInterest").max(10),
  level: z.enum(LEVELS),
  goal: z.enum(GOALS),
  style: z.enum(STYLES),
  weeklyHours: z.union([z.literal(2), z.literal(5), z.literal(10)]),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** What the wizard receives from the server to prefill answers. */
export type OnboardingState = {
  name: string;
  email: string;
  locale: AuthLocale;
  emailVerified: boolean;
  onboardingDone: boolean;
  profile: { headline: string; interests: string[]; level: Level | null; goal: Goal | null; style: Style | null; weeklyHours: WeeklyHours | null };
};

export type RecommendedCourse = {
  id: string; slug: string; titleEn: string; titleAr: string; summaryEn: string; summaryAr: string;
  difficulty: string; estimatedHours: number; coverGradient: string | null; rating: number; enrollmentCount: number;
  category: { slug: string; nameEn: string; nameAr: string } | null;
  reasonEn: string; reasonAr: string;
};

export type PlanItem = { id: string; kind: "review" | "lesson" | "practice" | "quiz" | "project"; minutes: number; titleEn: string; titleAr: string; href: string; courseId: string | null; lessonId: string | null; done: boolean };

export type OnboardingResult = {
  courses: RecommendedCourse[];
  plan: { items: PlanItem[]; rationaleEn: string; rationaleAr: string; minutes: number } | null;
};
