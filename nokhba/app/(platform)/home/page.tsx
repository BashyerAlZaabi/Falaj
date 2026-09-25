import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { greetingKey } from "@/lib/utils";

// Placeholder — replaced by the dashboard feature.
export default async function HomePage() {
  const user = await requireUser();
  const { t } = await getI18n();
  return (
    <div className="container-app py-8">
      <h1 className="font-heading text-title">{t(greetingKey(), { name: user.name?.split(" ")[0] ?? "" })}</h1>
      <p className="text-muted-foreground">{t("common.greeting.ready")}</p>
    </div>
  );
}
