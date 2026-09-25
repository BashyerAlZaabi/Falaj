"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PUBLIC_NAV } from "@/config/nav";
import { useI18n } from "@/lib/i18n/client";
import { LanguageSwitcher } from "./language-switcher";
import { NavIcon } from "./nav-icon";

export function PublicMobileNav() {
  const { t, dir } = useI18n();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("nav.menu")}><Menu className="size-5" /></Button>
      </SheetTrigger>
      <SheetContent side={dir === "rtl" ? "left" : "right"} className="glass-3 border-glass-border">
        <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
        <nav className="mt-8 flex flex-col gap-1">
          {PUBLIC_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium hover:bg-foreground/[0.05]">
              <NavIcon name={item.icon} className="size-5 text-muted-foreground" /> {t(item.key)}
            </Link>
          ))}
          <Link href="/sign-in" className="mt-2 rounded-xl px-3 py-2.5 text-base font-medium hover:bg-foreground/[0.05]">{t("common.actions.signIn")}</Link>
          <div className="mt-4 px-3"><LanguageSwitcher variant="outline" /></div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
