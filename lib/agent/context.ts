import { type FarmData } from "@/lib/farm/data";

/**
 * سياق النظام — يُبنى في كل رسالة من الحالة الحية (PROMPT §7).
 * النبرة: عربية بلهجة إماراتية بسيطة، مختصرة جداً، بدون شرح للأدوات.
 */

export type ProfileContext = {
  name?: string | null;
  activity?: string | null;
  emirate?: string | null;
  stage?: string | null;
};

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function buildSystemContext(
  profile: ProfileContext,
  farm: FarmData,
): string {
  const today = new Date().toISOString().slice(0, 10);

  const openTasks = farm.tasks.filter((t) => !t.done);
  const overdue = openTasks.filter((t) => t.due && t.due < today);
  const lowStock = farm.stock.filter((s) => s.qty <= s.min_qty);
  const revenue = farm.sales.reduce((a, s) => a + s.amount, 0);
  const costs = farm.costs.reduce((a, c) => a + c.amount, 0);
  const totalArea = farm.plots.reduce((a, p) => a + p.area_m2, 0);

  // الربحية حسب المحصول: مبيعات الصنف المطابق لاسم المحصول
  const byCrop = farm.harvests.map((h) => {
    const sold = farm.sales
      .filter((s) => s.item.includes(h.crop))
      .reduce((a, s) => a + s.amount, 0);
    return `${h.crop}: حصاد ${fmt.format(h.qty)} ${h.unit}${sold ? `، مبيعات ${fmt.format(sold)} درهم` : ""}`;
  });

  const lines = [
    "أنت مساعد مزارع في برنامج سفراء الزراعة الشبابية بدولة الإمارات.",
    "ردّ بعربية بلهجة إماراتية بسيطة، مختصر جداً. لا تشرح الأدوات ولا تذكرها، نفّذ مباشرة.",
    "نفّذ طلبات المستخدم بالأدوات المتاحة، وعند الحاجة لمعلومة حكومية حديثة استخدم بحث الويب — لا تعتمد على معلومات قديمة عن الجهات والخدمات.",
    "",
    `التاريخ: ${today}`,
    `المستخدم: ${profile.name || "غير مسمى"}`,
    `النشاط: ${profile.activity || "غير محدد"} · الإمارة: ${profile.emirate || "غير محددة"} · المرحلة: ${profile.stage || "غير محددة"}`,
    "",
    `الأرض: ${totalArea ? `${fmt.format(totalArea)} م²` : "لا أرض مسجّلة"} · القطع: ${farm.plots.length}`,
    farm.plots.length
      ? farm.plots.map((p) => `- ${p.name}: ${fmt.format(p.area_m2)} م²`).join("\n")
      : "",
    `الدورات النشطة: ${farm.cycles.filter((c) => c.status === "active").length}`,
    farm.cycles
      .filter((c) => c.status === "active")
      .map((c) => `- ${c.crop} منذ ${c.start}${c.harvest_days ? ` (حصاد بعد ~${c.harvest_days} يوم)` : ""}`)
      .join("\n"),
    `المهام المفتوحة: ${openTasks.length} (متأخرة: ${overdue.length})`,
    openTasks.slice(0, 10).map((t) => `- ${t.title}${t.due ? ` (تستحق ${t.due})` : ""}`).join("\n"),
    lowStock.length
      ? `مخزون تحت الحد: ${lowStock.map((s) => `${s.name} (${fmt.format(s.qty)} ${s.unit})`).join("، ")}`
      : "المخزون فوق الحد.",
    `الإيراد: ${fmt.format(revenue)} درهم · المصاريف: ${fmt.format(costs)} درهم · الصافي: ${fmt.format(revenue - costs)} درهم`,
    byCrop.length ? `حسب المحصول:\n${byCrop.join("\n")}` : "",
    farm.docs.length
      ? `التراخيص:\n${farm.docs.map((d) => `- ${d.name}${d.expiry ? ` (تنتهي ${d.expiry})` : ""}`).join("\n")}`
      : "لا تراخيص مسجّلة.",
  ];

  return lines.filter(Boolean).join("\n");
}
