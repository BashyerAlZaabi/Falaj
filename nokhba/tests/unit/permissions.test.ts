import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, areasFor, can, canAny, isAtLeast } from "@/lib/auth/permissions";

describe("permissions", () => {
  it("learners get learning permissions only", () => {
    const learner = { role: "LEARNER" as const };
    expect(can(learner, "course.enroll")).toBe(true);
    expect(can(learner, "ai.tutor")).toBe(true);
    expect(can(learner, "course.publish")).toBe(false);
    expect(can(learner, "admin.portal")).toBe(false);
    expect(can(learner, "users.manage")).toBe(false);
  });

  it("instructors can create and edit their own courses but not publish", () => {
    const instructor = { role: "INSTRUCTOR" as const };
    expect(can(instructor, "course.create")).toBe(true);
    expect(can(instructor, "course.edit.own")).toBe(true);
    expect(can(instructor, "course.edit.any")).toBe(false);
    expect(can(instructor, "course.publish")).toBe(false);
    expect(can(instructor, "instructor.dashboard")).toBe(true);
  });

  it("course managers publish and reach the admin portal", () => {
    const cm = { role: "COURSE_MANAGER" as const };
    expect(can(cm, "course.publish")).toBe(true);
    expect(can(cm, "admin.portal")).toBe(true);
    expect(can(cm, "users.manage")).toBe(false);
    expect(can(cm, "audit.view")).toBe(false);
  });

  it("super admins hold every permission", () => {
    for (const p of PERMISSIONS) expect(can({ role: "SUPER_ADMIN" }, p)).toBe(true);
    expect(ROLE_PERMISSIONS.SUPER_ADMIN.size).toBe(PERMISSIONS.length);
  });

  it("organization managers get org permissions through their membership even as learners", () => {
    expect(can({ role: "LEARNER", orgRole: "MANAGER" }, "org.skillsgap")).toBe(true);
    expect(can({ role: "LEARNER", orgRole: "OWNER" }, "org.members.manage")).toBe(true);
    expect(can({ role: "LEARNER", orgRole: "MEMBER" }, "org.view")).toBe(false);
    expect(can({ role: "LEARNER", orgRole: "MANAGER" }, "admin.portal")).toBe(false);
  });

  it("rejects missing subjects", () => {
    expect(can(null, "course.view")).toBe(false);
    expect(can(undefined, "course.view")).toBe(false);
    expect(canAny(null, ["course.view", "admin.portal"])).toBe(false);
    expect(canAny({ role: "LEARNER" }, ["admin.portal", "course.view"])).toBe(true);
  });

  it("maps roles to navigation areas", () => {
    expect(areasFor({ role: "LEARNER" })).toEqual({ learner: true, instructor: false, organization: false, admin: false });
    expect(areasFor({ role: "INSTRUCTOR" }).instructor).toBe(true);
    expect(areasFor({ role: "ORG_MANAGER" }).organization).toBe(true);
    expect(areasFor({ role: "ADMIN" })).toEqual({ learner: true, instructor: true, organization: true, admin: true });
    expect(areasFor(null).learner).toBe(false);
  });

  it("orders roles for isAtLeast", () => {
    expect(isAtLeast("ADMIN", "INSTRUCTOR")).toBe(true);
    expect(isAtLeast("LEARNER", "INSTRUCTOR")).toBe(false);
    expect(isAtLeast("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
  });
});
