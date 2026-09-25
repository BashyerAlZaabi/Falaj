import { getI18n } from "@/lib/i18n/server";
import { SignInForm } from "./sign-in-form";
import { socialProviders } from "@/auth.config";

// Baseline sign-in (the auth feature extends this with social buttons, errors, forgot-password).
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { t } = await getI18n();
  const { next, error } = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("common.actions.signIn")}</h1>
        <p className="text-sm text-muted-foreground">{t("common.app.tagline")}</p>
      </div>
      <SignInForm next={typeof next === "string" ? next : "/home"} error={typeof error === "string" ? error : null} providers={socialProviders()} />
    </div>
  );
}
