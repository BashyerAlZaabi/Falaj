import { type ActivityMode } from "./activities";

/**
 * التنقل — أربعة تبويبات رئيسية، وهذا نهائي (PROMPT §6).
 * الفرعي: «مزرعتي» و«المسار». الحساسات والمكافآت أُضيفتا بقرار المالكة
 * (مرجع التدفّق المصوّر) — في الفرعي فقط، لا في الرئيسي.
 */
export type MainTab = "today" | "farm" | "path" | "assistant";

export const MAIN_TABS: { key: MainTab; label: string; href: string }[] = [
  { key: "today", label: "اليوم", href: "/today" },
  { key: "farm", label: "مزرعتي", href: "/farm/land" },
  { key: "path", label: "المسار", href: "/path/roadmap" },
  { key: "assistant", label: "المساعد", href: "/assistant" },
];

export type FarmSection =
  | "land"
  | "plots"
  | "crops"
  | "tasks"
  | "stock"
  | "sensors"
  | "money"
  | "docs";

export const FARM_SECTIONS: { key: FarmSection; label: string }[] = [
  { key: "land", label: "الأرض" },
  { key: "plots", label: "القطع" },
  { key: "crops", label: "الدورات" },
  { key: "tasks", label: "المهام" },
  { key: "stock", label: "المخزون" },
  { key: "sensors", label: "الحساسات" },
  { key: "money", label: "المالية" },
  { key: "docs", label: "التراخيص" },
];

/** أقسام تُخفى تلقائياً في نمط النشاط biz (PROMPT §6). */
const LAND_ONLY: FarmSection[] = ["land", "plots", "crops"];

export function visibleFarmSections(mode: ActivityMode) {
  return mode === "biz"
    ? FARM_SECTIONS.filter((s) => !LAND_ONLY.includes(s.key))
    : FARM_SECTIONS;
}

export function isFarmSection(v: string): v is FarmSection {
  return FARM_SECTIONS.some((s) => s.key === v);
}

export type PathSection =
  | "roadmap"
  | "funds"
  | "partners"
  | "entities"
  | "rewards";

export const PATH_SECTIONS: { key: PathSection; label: string }[] = [
  { key: "roadmap", label: "خارطة الطريق" },
  { key: "funds", label: "الدعم والتمويل" },
  { key: "partners", label: "الشراكات" },
  { key: "entities", label: "الجهات" },
  { key: "rewards", label: "المكافآت" },
];

export function isPathSection(v: string): v is PathSection {
  return PATH_SECTIONS.some((s) => s.key === v);
}

/**
 * شارات البنود المتأخرة على التنقل الرئيسي والفرعي.
 * تُحسب من بيانات المزرعة الحية في المراحل ٤–٥؛ هنا البنية والأصفار.
 */
export type Badges = {
  main: Partial<Record<MainTab, number>>;
  farm: Partial<Record<FarmSection, number>>;
  path: Partial<Record<PathSection, number>>;
};

export const EMPTY_BADGES: Badges = { main: {}, farm: {}, path: {} };
