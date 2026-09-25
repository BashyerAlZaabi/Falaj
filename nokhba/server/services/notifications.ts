import "server-only";
import { db } from "@/lib/db";

export type NotificationKind = "lesson_reminder" | "course_update" | "deadline" | "certificate" | "recommendation" | "feedback" | "announcement" | "achievement" | "assignment";

export async function notify(userId: string, input: { kind: NotificationKind; titleEn: string; titleAr: string; bodyEn?: string; bodyAr?: string; href?: string }) {
  return db.notification.create({ data: { userId, ...input } });
}

export async function notifyMany(userIds: string[], input: Parameters<typeof notify>[1]) {
  if (!userIds.length) return { count: 0 };
  return db.notification.createMany({ data: userIds.map((userId) => ({ userId, ...input })) });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, take = 20) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export async function markRead(userId: string, ids?: string[]) {
  return db.notification.updateMany({ where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
