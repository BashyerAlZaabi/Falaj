import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PATH_SECTIONS, isPathSection } from "@/lib/domain/nav";
import { computeBadges } from "@/lib/badges";
import { PageTitle } from "@/components/page-title";
import { SubNav } from "@/components/nav/sub-nav";
import {
  EntitiesSection,
  FundsSection,
  PartnersSection,
  RewardsSection,
  RoadmapSection,
} from "@/components/path/sections";

export default async function PathSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isPathSection(section)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: p } = await supabase
    .from("profiles")
    .select("activity, emirate")
    .eq("id", user.id)
    .maybeSingle();

  const profile = { emirate: p?.emirate ?? null, activity: p?.activity ?? null };
  const current = PATH_SECTIONS.find((s) => s.key === section)!;
  const badges = await computeBadges(supabase, user.id);

  return (
    <div>
      <PageTitle>المسار · {current.label}</PageTitle>
      <div className="mt-3">
        <SubNav
          base="/path"
          sections={PATH_SECTIONS}
          badges={badges.path}
          label="أقسام المسار"
        />
      </div>

      <section className="mt-4">
        {current.key === "roadmap" && <RoadmapSection profile={profile} />}
        {current.key === "funds" && <FundsSection />}
        {current.key === "partners" && <PartnersSection profile={profile} />}
        {current.key === "entities" && <EntitiesSection profile={profile} />}
        {current.key === "rewards" && <RewardsSection />}
      </section>
    </div>
  );
}
