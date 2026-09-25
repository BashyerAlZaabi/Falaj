import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can, type Permission, type PermissionSubject } from "./permissions";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  locale: string;
  onboardingDone: boolean;
  orgMembership: { organizationId: string; role: "MEMBER" | "MANAGER" | "OWNER"; departmentId: string | null } | null;
};

/** The signed-in user with role + org membership, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, image: true, role: true, locale: true, onboardingDone: true,
      orgMemberships: { select: { organizationId: true, role: true, departmentId: true }, take: 1 },
    },
  });
  if (!user) return null;
  const m = user.orgMemberships[0];
  return { ...user, orgMembership: m ? { organizationId: m.organizationId, role: m.role, departmentId: m.departmentId } : null };
});

export function subjectOf(user: CurrentUser | null): PermissionSubject | null {
  return user ? { role: user.role, orgRole: user.orgMembership?.role ?? null } : null;
}

/** For pages: redirect to sign-in when signed out. */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/** For pages: redirect when the permission is missing. */
export async function requirePermission(permission: Permission, next?: string): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (!can(subjectOf(user), permission)) redirect("/home?denied=1");
  return user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For route handlers / server actions: throw instead of redirect. */
export async function requireUserApi(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Unauthorized");
  return user;
}

export async function requirePermissionApi(permission: Permission): Promise<CurrentUser> {
  const user = await requireUserApi();
  if (!can(subjectOf(user), permission)) throw new HttpError(403, "Forbidden");
  return user;
}

/** Wrap a route handler so HttpError and Zod errors become proper responses. */
export function apiHandler<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e && typeof e === "object" && "issues" in e) return Response.json({ error: "Invalid input", issues: (e as { issues: unknown }).issues }, { status: 400 });
      console.error("[api]", e);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
