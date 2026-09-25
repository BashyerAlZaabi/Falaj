import "server-only";
import { db } from "@/lib/db";

export type EventName =
  | "user_signed_up" | "onboarding_completed" | "enrolled" | "lesson_viewed" | "lesson_completed" | "course_completed"
  | "quiz_submitted" | "assessment_submitted" | "project_submitted" | "project_reviewed" | "ai_message" | "flashcard_reviewed"
  | "note_created" | "certificate_issued" | "achievement_earned" | "plan_started" | "search" | "course_published" | "path_started";

/** Fire-and-forget product analytics event. Never throws. */
export async function track(userId: string | null, name: EventName, properties: Record<string, unknown> = {}) {
  try {
    await db.analyticsEvent.create({ data: { userId, name, properties: properties as never } });
  } catch (e) {
    console.warn("[analytics] failed", name, (e as Error).message);
  }
}
