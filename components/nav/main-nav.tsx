"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_TABS, type Badges, type MainTab } from "@/lib/domain/nav";
import { Badge } from "./badge";

const ICONS: Record<MainTab, React.ReactNode> = {
  today: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </svg>
  ),
  farm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M12 21V11" />
      <path d="M12 11C12 7 9 4 4 4c0 5 3 8 8 7z" />
      <path d="M12 14c0-3.5 2.5-6 7-6 0 4.5-2.5 7-7 6z" />
    </svg>
  ),
  path: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="5" r="2.2" />
      <path d="M8 19h7a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h7" />
    </svg>
  ),
  assistant: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
    </svg>
  ),
};

/** التنقل الرئيسي — أربعة تبويبات، وهذا نهائي (PROMPT §6). */
export function MainNav({ badges }: { badges: Badges }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-24 bg-paper/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {MAIN_TABS.map((tab) => {
          const active =
            tab.key === "today"
              ? pathname === "/today" || pathname === "/"
              : pathname.startsWith(`/${tab.key}`);
          const count = badges.main[tab.key] ?? 0;
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center gap-0.5 py-2.5 font-head text-[0.7rem] text-ink-45 transition-colors duration-200 ease-e aria-[current=page]:text-falaj-d"
              >
                <span className="relative">
                  {ICONS[tab.key]}
                  {count > 0 && (
                    <span className="absolute -end-2 -top-1">
                      <Badge count={count} label={tab.label} />
                    </span>
                  )}
                </span>
                {tab.label}
                <span
                  aria-hidden="true"
                  className={`mt-0.5 h-1 w-6 rounded-full transition-colors duration-200 ease-e ${active ? "bg-falaj-l" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
