import "server-only";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/db";
import { notify } from "./notifications";
import { track } from "./analytics-events";

const code = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
export const certificateCode = () => `NKB-${new Date().getFullYear()}-${code()}`;

export async function issueCourseCertificate(userId: string, courseId: string) {
  const [user, course, existing] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    db.course.findUnique({ where: { id: courseId }, select: { titleEn: true, titleAr: true, offersCertificate: true, estimatedHours: true, skills: { select: { skillId: true } } } }),
    db.certificate.findFirst({ where: { userId, courseId, revokedAt: null } }),
  ]);
  if (!user || !course || !course.offersCertificate) return null;
  if (existing) return existing;
  const finalAttempt = await db.assessmentAttempt.findFirst({ where: { userId, assessment: { courseId, kind: "FINAL" }, status: "graded" }, orderBy: { score: "desc" }, select: { score: true } });
  const cert = await db.certificate.create({
    data: {
      code: certificateCode(), userId, courseId, titleEn: course.titleEn, titleAr: course.titleAr, learnerName: user.name ?? user.email,
      metadata: { finalScore: finalAttempt?.score ?? null, hours: course.estimatedHours },
      skills: { create: course.skills.map((s) => ({ skillId: s.skillId })) },
    },
  });
  await notify(userId, { kind: "certificate", titleEn: `Certificate earned: ${course.titleEn}`, titleAr: `حصلت على شهادة: ${course.titleAr}`, href: `/certificates/${cert.id}` });
  await track(userId, "certificate_issued", { certificateId: cert.id, courseId });
  return cert;
}

export async function issuePathCertificate(userId: string, learningPathId: string) {
  const [user, path, existing] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    db.learningPath.findUnique({ where: { id: learningPathId }, select: { titleEn: true, titleAr: true, estimatedWeeks: true, skills: { select: { skillId: true } } } }),
    db.certificate.findFirst({ where: { userId, learningPathId, revokedAt: null } }),
  ]);
  if (!user || !path) return null;
  if (existing) return existing;
  const cert = await db.certificate.create({ data: { code: certificateCode(), userId, learningPathId, titleEn: path.titleEn, titleAr: path.titleAr, learnerName: user.name ?? user.email, metadata: { weeks: path.estimatedWeeks }, skills: { create: path.skills.map((s) => ({ skillId: s.skillId })) } } });
  await notify(userId, { kind: "certificate", titleEn: `Path certificate earned: ${path.titleEn}`, titleAr: `حصلت على شهادة المسار: ${path.titleAr}`, href: `/certificates/${cert.id}` });
  await track(userId, "certificate_issued", { certificateId: cert.id, learningPathId });
  return cert;
}

/** Public verification (no auth): returns only what belongs on a public certificate page. */
export async function verifyCertificate(codeOrId: string) {
  const cert = await db.certificate.findFirst({ where: { OR: [{ code: codeOrId.toUpperCase() }, { id: codeOrId }] }, include: { skills: { include: { skill: { select: { nameEn: true, nameAr: true } } } }, course: { select: { slug: true, estimatedHours: true } }, learningPath: { select: { slug: true } } } });
  if (!cert) return null;
  return { id: cert.id, code: cert.code, titleEn: cert.titleEn, titleAr: cert.titleAr, learnerName: cert.learnerName, issuedAt: cert.issuedAt, expiresAt: cert.expiresAt, revoked: !!cert.revokedAt, skills: cert.skills.map((s) => s.skill), courseSlug: cert.course?.slug ?? null, pathSlug: cert.learningPath?.slug ?? null, hours: cert.course?.estimatedHours ?? null, valid: !cert.revokedAt && (!cert.expiresAt || cert.expiresAt > new Date()) };
}
