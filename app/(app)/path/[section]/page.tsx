import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PATH_SECTIONS, isPathSection } from "@/lib/domain/nav";
import { computeBadges } from "@/lib/badges";
import { PageTitle } from "@/components/page-title";
import { SubNav } from "@/components/nav/sub-nav";
import { EmptyState } from "@/components/ui/empty-state";

const HINTS: Record<string, string> = {
  roadmap: "مراحل مشروعك الأربع وخطواتها حسب إمارتك ونشاطك",
  funds: "صناديق التمويل والمنح والحاضنات المناسبة لك",
  partners: "عروض الشراكة المفتوحة من أصحاب المشاريع",
  entities: "الجهات الاتحادية والمحلية المعنيّة بمشروعك",
  rewards: "نقاطك ومكافآتك كسفير زراعة شبابي",
};

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

  const current = PATH_SECTIONS.find((s) => s.key === section)!;
  const badges = await computeBadges(user.id);

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
        <EmptyState
          title={`لا شيء في ${current.label} بعد`}
          hint={HINTS[current.key]}
        />
      </section>
    </div>
  );
}
