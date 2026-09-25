import { getI18n } from "@/lib/i18n/server";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const { locale } = await getI18n();
  return (
    <div className="ambient flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Brand nameAr={locale === "ar"} />
        <div className="flex items-center gap-1"><LanguageSwitcher /><ThemeToggle /></div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="glass-3 w-full max-w-md rounded-3xl p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
