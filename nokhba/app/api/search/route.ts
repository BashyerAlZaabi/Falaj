import { z } from "zod";
import { apiHandler, requireUserApi } from "@/lib/auth/session";
import { parseQuery } from "@/lib/security/validate";
import { getLocale } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { track } from "@/server/services/analytics-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q= — global search across courses, lessons, learning paths, skills and the
 * user's notes (title/content match). Returns grouped results for the command palette and
 * the /search page. AI answers over content are served by /api/ai/chat kind=search.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUserApi();
  const { q } = parseQuery(req.url, z.object({ q: z.string().min(1).max(120) }));
  const locale = await getLocale();
  const term = q.trim();
  const L = <T extends { titleEn: string; titleAr: string }>(r: T) => (locale === "ar" ? r.titleAr : r.titleEn);
  const contains = { contains: term, mode: "insensitive" as const };

  const [courses, lessons, paths, skills, notes] = await Promise.all([
    db.course.findMany({ where: { status: "PUBLISHED", OR: [{ titleEn: contains }, { titleAr: contains }, { summaryEn: contains }, { summaryAr: contains }] }, select: { id: true, slug: true, titleEn: true, titleAr: true, category: { select: { nameEn: true, nameAr: true } } }, take: 5 }),
    db.lesson.findMany({ where: { module: { course: { status: "PUBLISHED" } }, OR: [{ titleEn: contains }, { titleAr: contains }] }, select: { id: true, titleEn: true, titleAr: true, module: { select: { courseId: true, course: { select: { titleEn: true, titleAr: true } } } } }, take: 6 }),
    db.learningPath.findMany({ where: { status: "PUBLISHED", OR: [{ titleEn: contains }, { titleAr: contains }] }, select: { id: true, slug: true, titleEn: true, titleAr: true }, take: 3 }),
    db.skill.findMany({ where: { OR: [{ nameEn: contains }, { nameAr: contains }] }, select: { id: true, slug: true, nameEn: true, nameAr: true }, take: 4 }),
    db.note.findMany({ where: { userId: user.id, OR: [{ title: contains }, { body: contains }] }, select: { id: true, title: true, body: true, lessonId: true }, take: 4 }),
  ]);
  await track(user.id, "search", { q: term });
  const results = [
    ...courses.map((c) => ({ type: "course", id: c.id, title: L(c), subtitle: locale === "ar" ? c.category.nameAr : c.category.nameEn, href: `/courses/${c.slug}` })),
    ...lessons.map((l) => ({ type: "lesson", id: l.id, title: L(l), subtitle: L(l.module.course), href: `/learn/${l.module.courseId}/${l.id}` })),
    ...paths.map((p) => ({ type: "path", id: p.id, title: L(p), href: `/paths/${p.slug}` })),
    ...skills.map((s) => ({ type: "skill", id: s.id, title: locale === "ar" ? s.nameAr : s.nameEn, href: `/skills#${s.slug}` })),
    ...notes.map((n) => ({ type: "note", id: n.id, title: n.title || n.body.slice(0, 60), href: n.lessonId ? `/notes?lesson=${n.lessonId}` : "/notes" })),
  ];
  return Response.json({ results });
});
