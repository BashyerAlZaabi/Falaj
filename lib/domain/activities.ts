/**
 * الأنشطة — النمط land (زراعي بأرض) أو biz (أعمال بلا أرض).
 * نمط biz يخفي «الأرض والقطع والدورات» تلقائياً (PROMPT §6).
 *
 * أنشطة biz الستة منصوصة حرفياً في PROMPT §6.
 * القائمة الكاملة (١٤ نشاطاً بأيقونة وland وpermit) تُنقل من prototype.html
 * عند توفّره — لا تُخترع هنا.
 */
export type ActivityMode = "land" | "biz";

export type Activity = {
  name: string;
  icon: string;
  land: boolean;
  /** وصف عام للترخيص — الجهة المحددة يجيبها المساعد ببحث حي */
  permit: string;
  mode: ActivityMode;
};

/** ١٤ نشاطاً: ٨ زراعية بأرض + ٦ أعمال (الستة منصوصة في PROMPT §6). */
export const ACTIVITIES: Activity[] = [
  { name: "زراعة محمية", icon: "🏡", land: true, permit: "رخصة حيازة زراعية وبيوت محمية", mode: "land" },
  { name: "زراعة مكشوفة", icon: "🌱", land: true, permit: "رخصة حيازة زراعية", mode: "land" },
  { name: "نخيل وتمور", icon: "🌴", land: true, permit: "رخصة حيازة زراعية", mode: "land" },
  { name: "ثروة حيوانية", icon: "🐐", land: true, permit: "رخصة حيازة وتربية مواشٍ", mode: "land" },
  { name: "دواجن", icon: "🐔", land: true, permit: "رخصة مزرعة دواجن", mode: "land" },
  { name: "استزراع سمكي", icon: "🐟", land: true, permit: "رخصة استزراع مائي", mode: "land" },
  { name: "نحل وعسل", icon: "🐝", land: true, permit: "رخصة مناحل", mode: "land" },
  { name: "أعلاف", icon: "🌾", land: true, permit: "رخصة حيازة زراعية", mode: "land" },
  { name: "تصنيع", icon: "🏭", land: false, permit: "رخصة صناعية", mode: "biz" },
  { name: "تعبئة", icon: "📦", land: false, permit: "رخصة تعبئة وتغليف", mode: "biz" },
  { name: "تجارة", icon: "🛒", land: false, permit: "رخصة تجارية", mode: "biz" },
  { name: "مدخلات", icon: "🧪", land: false, permit: "رخصة تجارة مدخلات زراعية", mode: "biz" },
  { name: "أجريتك", icon: "🤖", land: false, permit: "رخصة تقنية زراعية", mode: "biz" },
  { name: "استشارات", icon: "📋", land: false, permit: "رخصة استشارات مهنية", mode: "biz" },
];

export const BIZ_ACTIVITIES = ACTIVITIES.filter((a) => a.mode === "biz").map(
  (a) => a.name,
);

export function activityMode(activity: string | null | undefined): ActivityMode {
  if (!activity) return "land";
  return (BIZ_ACTIVITIES as readonly string[]).includes(activity)
    ? "biz"
    : "land";
}
