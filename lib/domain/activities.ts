/**
 * الأنشطة — النمط land (زراعي بأرض) أو biz (أعمال بلا أرض).
 * نمط biz يخفي «الأرض والقطع والدورات» تلقائياً (PROMPT §6).
 *
 * أنشطة biz الستة منصوصة حرفياً في PROMPT §6.
 * القائمة الكاملة (١٤ نشاطاً بأيقونة وland وpermit) تُنقل من prototype.html
 * عند توفّره — لا تُخترع هنا.
 */
export type ActivityMode = "land" | "biz";

export const BIZ_ACTIVITIES = [
  "تصنيع",
  "تعبئة",
  "تجارة",
  "مدخلات",
  "أجريتك",
  "استشارات",
] as const;

export function activityMode(activity: string | null | undefined): ActivityMode {
  if (!activity) return "land";
  return (BIZ_ACTIVITIES as readonly string[]).includes(activity)
    ? "biz"
    : "land";
}
