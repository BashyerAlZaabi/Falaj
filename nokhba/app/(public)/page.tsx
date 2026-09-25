import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";

// Placeholder — replaced by the landing feature.
export default async function LandingPage() {
  const { t } = await getI18n();
  return (
    <section className="container-app py-24 text-center">
      <h1 className="font-heading text-display">{t("common.app.tagline")}</h1>
      <div className="mt-8 flex justify-center gap-3">
        <Button asChild size="lg" className="rounded-full px-6"><Link href="/sign-up">{t("common.actions.startLearning")}</Link></Button>
        <Button asChild size="lg" variant="outline" className="rounded-full px-6"><Link href="/programs">{t("common.actions.explorePrograms")}</Link></Button>
      </div>
    </section>
  );
}
