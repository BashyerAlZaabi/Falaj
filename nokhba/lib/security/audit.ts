import "server-only";
import { db } from "@/lib/db";

/** Append-only audit log for privileged actions (admin/instructor/org) and security events. */
export async function audit(actorId: string | null, action: string, target?: { type: string; id?: string }, details?: Record<string, unknown>, ip?: string | null) {
  try {
    await db.auditLog.create({ data: { actorId, action, targetType: target?.type, targetId: target?.id, details: details as never, ip: ip ?? undefined } });
  } catch (e) {
    console.warn("[audit] failed", action, (e as Error).message);
  }
}
