"use client";

import Link from "next/link";
import { Clock, Star, Users } from "lucide-react";
import { Glass } from "@/components/ui/glass";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useI18n, useLocalized } from "@/lib/i18n/client";
import { formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import { CourseCover } from "./course-cover";

export type CourseCardData = {
  id: string; slug: string; titleEn: string; titleAr: string; summaryEn: string; summaryAr: string;
  difficulty: string; estimatedHours: number; coverGradient?: string | null; rating?: number; ratingCount?: number; enrollmentCount?: number;
  category?: { slug: string; nameEn: string; nameAr: string } | null;
  instructor?: { user: { name: string | null } } | null;
  skills?: Array<{ skill: { nameEn: string; nameAr: string } }>;
  progress?: number | null;
};

/** The canonical course card used on the dashboard, catalog, paths and org pages. */
export function CourseCard({ course, href, reason, className, compact }: { course: CourseCardData; href?: string; reason?: string; className?: string; compact?: boolean }) {
  const { t, locale } = useI18n();
  const L = useLocalized();
  const link = href ?? (course.progress != null ? `/learn/${course.id}` : `/courses/${course.slug}`);
  return (
    <Link href={link} className={cn("group block focus-visible:outline-none", className)}>
      <Glass level={2} interactive className="flex h-full flex-col overflow-hidden rounded-3xl p-0 transition-transform duration-300 ease-out-expo group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CourseCover token={course.coverGradient} className={compact ? "h-24" : "h-36"}>
          {course.category && <Badge variant="secondary" className="absolute start-4 top-4 bg-white/80 text-foreground backdrop-blur dark:bg-black/40 dark:text-white">{L(course.category, "name")}</Badge>}
        </CourseCover>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="space-y-1">
            <h3 className="font-heading text-base font-semibold leading-snug tracking-tight group-hover:text-primary">{L(course, "title")}</h3>
            {!compact && <p className="line-clamp-2 text-sm text-muted-foreground">{L(course, "summary")}</p>}
          </div>
          {reason && <p className="rounded-xl bg-primary/8 px-3 py-2 text-xs text-primary">{reason}</p>}
          {course.skills && course.skills.length > 0 && !compact && (
            <div className="flex flex-wrap gap-1.5">
              {course.skills.slice(0, 3).map((s, i) => <span key={i} className="rounded-full border border-glass-border bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground">{L(s.skill, "name")}</span>)}
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground/80">{t(`common.level.${course.difficulty}`)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{t("common.time.hoursLong", { n: formatNumber(course.estimatedHours, locale) })}</span>
            {course.rating ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-current text-warning" />{formatNumber(course.rating, locale, { maximumFractionDigits: 1 })}</span> : null}
            {course.enrollmentCount ? <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{formatNumber(course.enrollmentCount, locale)}</span> : null}
          </div>
          {course.instructor?.user.name && <p className="text-xs text-muted-foreground">{course.instructor.user.name}</p>}
          {course.progress != null && (
            <div className="space-y-1">
              <Progress value={course.progress} className="h-1.5" />
              <p className="tnum text-[11px] text-muted-foreground">{course.progress}%</p>
            </div>
          )}
        </div>
      </Glass>
    </Link>
  );
}
