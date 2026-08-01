"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "./badge";

/**
 * التنقل الفرعي لـ«مزرعتي» و«المسار» — شريط أفقي قابل للتمرير،
 * مع شارات حمراء للبنود المتأخرة على كل قسم.
 */
export function SubNav({
  base,
  sections,
  badges,
  label,
}: {
  base: "/farm" | "/path";
  sections: { key: string; label: string }[];
  badges: Partial<Record<string, number>>;
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="-mx-5 overflow-x-auto px-5">
      <ul className="flex w-max gap-1.5 pb-1">
        {sections.map((s) => {
          const href = `${base}/${s.key}`;
          const active = pathname === href;
          const count = badges[s.key] ?? 0;
          return (
            <li key={s.key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-transparent px-3 py-1.5 font-head text-sm text-ink-45 transition-colors duration-200 ease-e hover:text-ink-70 aria-[current=page]:border-ink-24 aria-[current=page]:bg-paper aria-[current=page]:text-falaj-d"
              >
                {s.label}
                <Badge count={count} label={s.label} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
