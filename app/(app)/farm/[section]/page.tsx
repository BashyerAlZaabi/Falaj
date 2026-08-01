import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activityMode } from "@/lib/domain/activities";
import {
  FARM_SECTIONS,
  isFarmSection,
  visibleFarmSections,
  type FarmSection,
} from "@/lib/domain/nav";
import { computeBadges } from "@/lib/badges";
import { PageTitle } from "@/components/page-title";
import { SubNav } from "@/components/nav/sub-nav";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CropsSection,
  DocsSection,
  MoneySection,
  PlotsSection,
  SensorsSection,
  StockSection,
  TasksSection,
} from "@/components/farm/sections";
import { LandSection } from "@/components/farm/land";

const SECTIONS: Partial<Record<FarmSection, React.ComponentType>> = {
  land: LandSection,
  plots: PlotsSection,
  crops: CropsSection,
  tasks: TasksSection,
  stock: StockSection,
  sensors: SensorsSection,
  money: MoneySection,
  docs: DocsSection,
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
  const Body = SECTIONS[current.key];

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
        {Body ? <Body /> : <EmptyState title={`لا شيء في ${current.label} بعد`} />}
      </section>
    </div>
  );
}
