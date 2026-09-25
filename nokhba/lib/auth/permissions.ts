import type { UserRole } from "@prisma/client";

/**
 * Permission architecture. Features check permissions (can(user, "course.publish")),
 * never roles directly, so access rules live in one place and organizations can
 * later add custom roles by mapping them here.
 */
export const PERMISSIONS = [
  // learning
  "course.view", "course.enroll", "lesson.complete", "assessment.take", "project.submit",
  "ai.tutor", "ai.companion", "notes.manage", "certificate.view",
  // teaching
  "course.create", "course.edit.own", "course.edit.any", "course.publish", "course.delete",
  "assessment.manage", "project.review", "students.view", "instructor.dashboard",
  // organization
  "org.view", "org.members.manage", "org.assign", "org.analytics", "org.paths.manage", "org.skillsgap",
  // administration
  "admin.portal", "users.manage", "users.role.change", "categories.manage", "paths.manage",
  "instructors.manage", "certificates.manage", "ai.config", "announcements.manage",
  "analytics.platform", "audit.view", "ai.course.generate", "system.settings",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const LEARNER: Permission[] = [
  "course.view", "course.enroll", "lesson.complete", "assessment.take", "project.submit",
  "ai.tutor", "ai.companion", "notes.manage", "certificate.view",
];
const INSTRUCTOR: Permission[] = [
  ...LEARNER, "course.create", "course.edit.own", "assessment.manage", "project.review",
  "students.view", "instructor.dashboard", "ai.course.generate",
];
const COURSE_MANAGER: Permission[] = [
  ...INSTRUCTOR, "course.edit.any", "course.publish", "course.delete", "categories.manage",
  "paths.manage", "instructors.manage", "admin.portal", "announcements.manage",
];
const ORG_MANAGER: Permission[] = [
  ...LEARNER, "org.view", "org.members.manage", "org.assign", "org.analytics", "org.paths.manage", "org.skillsgap",
];
const ADMIN: Permission[] = [
  ...COURSE_MANAGER, ...ORG_MANAGER, "users.manage", "certificates.manage", "ai.config",
  "analytics.platform", "audit.view",
];
const SUPER_ADMIN: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  LEARNER: new Set(LEARNER),
  INSTRUCTOR: new Set(INSTRUCTOR),
  COURSE_MANAGER: new Set(COURSE_MANAGER),
  ORG_MANAGER: new Set(ORG_MANAGER),
  ADMIN: new Set(ADMIN),
  SUPER_ADMIN: new Set(SUPER_ADMIN),
};

export const ROLE_ORDER: UserRole[] = ["LEARNER", "INSTRUCTOR", "COURSE_MANAGER", "ORG_MANAGER", "ADMIN", "SUPER_ADMIN"];

export type PermissionSubject = { role: UserRole; orgRole?: "MEMBER" | "MANAGER" | "OWNER" | null };

export function can(subject: PermissionSubject | null | undefined, permission: Permission): boolean {
  if (!subject) return false;
  if (ROLE_PERMISSIONS[subject.role]?.has(permission)) return true;
  // Organization managers/owners get org.* permissions inside their organization even as LEARNER platform users.
  if (permission.startsWith("org.") && (subject.orgRole === "MANAGER" || subject.orgRole === "OWNER")) return true;
  return false;
}

export function canAny(subject: PermissionSubject | null | undefined, permissions: Permission[]) {
  return permissions.some((p) => can(subject, p));
}

/** Which app areas a role sees in navigation. */
export function areasFor(subject: PermissionSubject | null | undefined) {
  return {
    learner: !!subject,
    instructor: can(subject, "instructor.dashboard"),
    organization: can(subject, "org.view"),
    admin: can(subject, "admin.portal"),
  };
}

export function isAtLeast(role: UserRole, minimum: UserRole) {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}
