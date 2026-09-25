import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { PUBLIC_NAV } from "@/config/nav";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { PublicMobileNav } from "@/components/layout/public-mobile-nav";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const { t, locale } = await getI18n();
  const user = await getCurrentUser();
  return (
    <div className="ambient flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <div className="glass-1 container-app flex h-14 items-center gap-2 rounded-2xl border border-glass-border px-3 sm:px-4">
          <Brand nameAr={locale === "ar"} />
          <nav className="ms-6 hidden items-center gap-1 md:flex" aria-label="Primary">
            {PUBLIC_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">{t(item.key)}</Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle />
            {user ? (
              <Button asChild size="sm" className="rounded-full px-4"><Link href="/home">{t("nav.home")}</Link></Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/sign-in">{t("common.actions.signIn")}</Link></Button>
                <Button asChild size="sm" className="rounded-full px-4"><Link href="/sign-up">{t("common.actions.getStarted")}</Link></Button>
              </>
            )}
            <PublicMobileNav />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/60 py-10">
        <div className="container-app grid gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <Brand nameAr={locale === "ar"} />
            <p className="max-w-xs text-sm text-muted-foreground">{t("common.app.tagline")}</p>
          </div>
          {[
            { title: t("common.footer.product"), links: [{ href: "/programs", label: t("nav.programs") }, { href: "/courses", label: t("nav.courses") }, { href: "/enterprise", label: t("nav.enterprise") }] },
            { title: t("common.footer.company"), links: [{ href: "/about", label: t("nav.about") }] },
            { title: t("common.footer.resources"), links: [{ href: "/verify", label: t("common.footer.verify") }, { href: "/privacy", label: t("common.footer.privacy") }, { href: "/terms", label: t("common.footer.terms") }] },
          ].map((col) => (
            <div key={col.title}>
              <p className="mb-3 text-sm font-semibold">{col.title}</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {col.links.map((l) => <li key={l.href}><Link href={l.href} className="hover:text-foreground">{l.label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="container-app mt-8 text-xs text-muted-foreground">{t("common.footer.rights", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
