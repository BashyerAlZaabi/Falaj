import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activityMode } from "@/lib/domain/activities";
import {
  FARM_SECTIONS,
  isFarmSection,
  visibleFarmSections,
} from "@/lib/domain/nav";
import { computeBadges } from "@/lib/badges";
import { PageTitle } from "@/components/page-title";
import { SubNav } from "@/components/nav/sub-nav";
import { EmptyState } from "@/components/ui/empty-state";

const HINTS: Record<string, string> = {
  land: "ارسم حدود أرضك على الخريطة وقسّمها — يكتمل في مرحلة الأرض",
  plots: "قطع أرضك تظهر هنا بعد التقسيم",
  crops: "دورات المحاصيل على كل قطعة",
  tasks: "مهامك اليومية والمتأخرة",
  stock: "مخزونك من البذور والسماد والمستلزمات",
  sensors: "اربط حساسات الري وتابع قراءاتها هنا",
  money: "الإيراد والمصاريف وصافي الربح",
  docs: "تراخيصك وتواريخ انتهائها",
};

export default async function FarmSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isFarmSection(section)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("activity")
    .eq("id", user.id)
    .maybeSingle();

  const mode = activityMode(profile?.activity);
  const sections = visibleFarmSections(mode);

  // نمط biz يخفي الأرض والقطع والدورات — الوصول المباشر يُحوَّل للمهام
  if (!sections.some((s) => s.key === section)) redirect("/farm/tasks");

  const current = FARM_SECTIONS.find((s) => s.key === section)!;
  const badges = await computeBadges(supabase, user.id);

  return (
    <div>
      <PageTitle>مزرعتي · {current.label}</PageTitle>
      <div className="mt-3">
        <SubNav
          base="/farm"
          sections={sections}
          badges={badges.farm}
          label="أقسام مزرعتي"
        />
      </div>

      <section className="mt-4">
        <EmptyState
          title={`لا شيء في ${current.label} بعد`}
          hint={HINTS[current.key]}
        />
      </section>
    </div>
  );
}
