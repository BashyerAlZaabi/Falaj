"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, ChevronsLeft, ChevronsRight, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import type { NavItem } from "@/config/nav";
import { MOBILE_NAV_KEYS } from "@/config/nav";
import { NavIcon } from "./nav-icon";
import { Brand, BrandMark } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";
import { UserMenu, type ShellUser } from "./user-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/command/command-palette";
import { CompanionPanel } from "@/components/ai/companion-panel";
import { NotificationsPopover } from "./notifications-popover";

export type NavSection = { key: string; items: NavItem[] };

export function AppShell({ user, sections, unread, children }: { user: ShellUser; sections: NavSection[]; unread: number; children: React.ReactNode }) {
  const { t, dir } = useI18n();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("nokhba_rail") === "collapsed"); } catch {}
  }, []);
  const toggleRail = () => setCollapsed((c) => { try { localStorage.setItem("nokhba_rail", c ? "expanded" : "collapsed"); } catch {} return !c; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setCompanionOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (item: NavItem) => (item.match ?? [item.href]).some((m) => pathname === m || pathname.startsWith(m + "/")) || pathname === item.href;
  const learnerItems = sections.find((s) => s.key === "learning")?.items ?? [];
  const mobileItems = MOBILE_NAV_KEYS.map((k) => learnerItems.find((i) => i.key === k)).filter(Boolean) as NavItem[];
  const isFocusMode = /^\/learn\/[^/]+\/[^/]+/.test(pathname); // lesson screen: hide chrome

  return (
    <div className="ambient flex min-h-dvh w-full">
      {/* Desktop navigation rail */}
      {!isFocusMode && (
        <motion.aside
          aria-label={t("nav.menu")}
          initial={false}
          animate={{ width: collapsed ? 76 : 248 }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          className="glass-1 sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-e border-glass-border lg:flex"
        >
          <div className={cn("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
            {collapsed ? <Link href="/home" aria-label="Nokhba"><BrandMark /></Link> : <Brand href="/home" nameAr={dir === "rtl"} />}
          </div>
          <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 pb-4">
            {sections.map((section) => (
              <div key={section.key}>
                {!collapsed && sections.length > 1 && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t(`nav.sections.${section.key}`)}</p>}
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isActive(item);
                    const link = (
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground",
                          active && "text-foreground",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        {active && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-xl bg-foreground/[0.07] dark:bg-foreground/[0.09]" transition={{ type: "spring", stiffness: 400, damping: 35 }} />}
                        <NavIcon name={item.icon} className={cn("relative size-[18px] shrink-0", active && "text-primary")} />
                        {!collapsed && <span className="relative truncate">{t(item.key)}</span>}
                      </Link>
                    );
                    return (
                      <li key={item.href}>
                        {collapsed ? (
                          <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side={dir === "rtl" ? "left" : "right"}>{t(item.key)}</TooltipContent></Tooltip>
                        ) : link}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className={cn("flex items-center gap-1 border-t border-glass-border p-3", collapsed && "flex-col")}>
            <Button variant="ghost" size="icon" onClick={toggleRail} aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}>
              {(collapsed ? dir === "rtl" : dir !== "rtl") ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            </Button>
            {!collapsed && <div className="flex-1" />}
            <ThemeToggle />
          </div>
        </motion.aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        {!isFocusMode && (
          <header className="glass-1 sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-glass-border px-4 sm:h-16 sm:px-6">
            <div className="lg:hidden"><Brand href="/home" nameAr={dir === "rtl"} /></div>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="ms-auto hidden h-9 w-72 items-center gap-2 rounded-xl border border-glass-border bg-background/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-background/80 md:flex"
              aria-label={t("nav.openCommandPalette")}
            >
              <Search className="size-4" />
              <span className="flex-1 text-start">{t("common.palette.placeholder")}</span>
              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
            </button>
            <Button variant="ghost" size="icon" className="ms-auto md:ms-0 md:hidden" onClick={() => setPaletteOpen(true)} aria-label={t("nav.openCommandPalette")}><Search className="size-4" /></Button>
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <NotificationsPopover unread={unread} />
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setCompanionOpen(true)} aria-label={t("common.ai.companion")}>
              <span className="ai-orb inline-grid size-6 place-items-center rounded-full text-white"><Sparkles className="size-3" /></span>
            </Button>
            <UserMenu user={user} />
          </header>
        )}

        <main id="main" className={cn("flex-1", !isFocusMode && "pb-24 lg:pb-8")}>{children}</main>

        {/* Mobile bottom navigation */}
        {!isFocusMode && (
          <nav aria-label={t("nav.menu")} className="glass-1 safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-glass-border px-1 pt-1 lg:hidden">
            {mobileItems.map((item) => {
              const active = isActive(item);
              if (item.key === "nav.aiTutor") {
                return (
                  <button key={item.href} type="button" onClick={() => setCompanionOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium text-muted-foreground" aria-label={t("common.ai.companion")}>
                    <span className="ai-orb ai-orb-glow grid size-9 -translate-y-3 place-items-center rounded-full text-white shadow-float"><Sparkles className="size-4" /></span>
                    <span className="-mt-2">{t(item.key)}</span>
                  </button>
                );
              }
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium text-muted-foreground", active && "text-primary")}>
                  <NavIcon name={item.icon} className="size-5" />
                  <span>{t(item.key)}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Desktop floating AI orb */}
        {!isFocusMode && (
          <button
            type="button"
            onClick={() => setCompanionOpen(true)}
            aria-label={t("common.ai.companion")}
            className="ai-orb ai-orb-glow fixed bottom-6 end-6 z-30 hidden size-14 place-items-center rounded-full text-white shadow-float transition-transform hover:scale-105 lg:grid"
          >
            <Sparkles className="size-6" />
          </button>
        )}
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onAskAi={() => { setPaletteOpen(false); setCompanionOpen(true); }} />
      <CompanionPanel open={companionOpen} onOpenChange={setCompanionOpen} />
    </div>
  );
}
