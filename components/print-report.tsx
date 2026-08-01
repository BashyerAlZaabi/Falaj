"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { emptyFarm, normalizeFarm, type FarmData } from "@/lib/farm/data";

/**
 * تقرير الطباعة — الطباعة تخفي كل شيء عدا #printArea بجداول كاملة
 * (PROMPT §11). يتعبأ من الحالة الحية عند الفتح.
 */

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function PrintReport() {
  const [farm, setFarm] = useState<FarmData>(emptyFarm());
  const [name, setName] = useState("");
  const [meta, setMeta] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: p }, { data: f }] = await Promise.all([
        supabase.from("profiles").select("name, activity, emirate").eq("id", user.id).maybeSingle(),
        supabase.from("farms").select("data").eq("owner", user.id).maybeSingle(),
      ]);
      setName(p?.name || "");
      setMeta([p?.activity, p?.emirate].filter(Boolean).join(" · "));
      setFarm(normalizeFarm(f?.data));
    })();
  }, []);

  const revenue = farm.sales.reduce((a, s) => a + s.amount, 0);
  const costs = farm.costs.reduce((a, c) => a + c.amount, 0);

  const th = "border border-gray-400 bg-gray-100 px-2 py-1 text-right text-xs font-bold";
  const td = "border border-gray-300 px-2 py-1 text-right text-xs";

  return (
    <div id="printArea" aria-hidden="true">
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>تقرير المزرعة — {name}</h1>
      <p style={{ fontSize: 12 }}>
        {meta} · تاريخ التقرير: <span dir="ltr">{new Date().toISOString().slice(0, 10)}</span>
      </p>

      <h2 style={{ fontSize: 14, marginTop: 12 }}>الملخص المالي</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <tr>
            <td className={th}>الإيراد</td>
            <td className={td} dir="ltr">{fmt.format(revenue)} د.إ</td>
            <td className={th}>المصاريف</td>
            <td className={td} dir="ltr">{fmt.format(costs)} د.إ</td>
            <td className={th}>الصافي</td>
            <td className={td} dir="ltr">{fmt.format(revenue - costs)} د.إ</td>
          </tr>
        </tbody>
      </table>

      {farm.plots.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, marginTop: 12 }}>القطع ({farm.plots.length})</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th className={th}>القطعة</th><th className={th}>المساحة م²</th></tr></thead>
            <tbody>
              {farm.plots.map((p) => (
                <tr key={p.id}><td className={td}>{p.name}</td><td className={td} dir="ltr">{fmt.format(p.area_m2)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {farm.cycles.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, marginTop: 12 }}>الدورات ({farm.cycles.length})</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th className={th}>المحصول</th><th className={th}>البداية</th><th className={th}>الحالة</th></tr></thead>
            <tbody>
              {farm.cycles.map((c) => (
                <tr key={c.id}><td className={td}>{c.crop}</td><td className={td} dir="ltr">{c.start}</td><td className={td}>{c.status === "active" ? "نشطة" : "منتهية"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {farm.tasks.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, marginTop: 12 }}>المهام ({farm.tasks.length})</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th className={th}>المهمة</th><th className={th}>الاستحقاق</th><th className={th}>الحالة</th></tr></thead>
            <tbody>
              {farm.tasks.map((t) => (
                <tr key={t.id}><td className={td}>{t.title}</td><td className={td} dir="ltr">{t.due || "—"}</td><td className={td}>{t.done ? "منجزة" : "مفتوحة"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {farm.stock.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, marginTop: 12 }}>المخزون ({farm.stock.length})</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th className={th}>الصنف</th><th className={th}>الكمية</th><th className={th}>الحد الأدنى</th></tr></thead>
            <tbody>
              {farm.stock.map((s) => (
                <tr key={s.id}><td className={td}>{s.name}</td><td className={td} dir="ltr">{fmt.format(s.qty)} {s.unit}</td><td className={td} dir="ltr">{fmt.format(s.min_qty)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(farm.sales.length > 0 || farm.costs.length > 0) && (
        <>
          <h2 style={{ fontSize: 14, marginTop: 12 }}>الحركة المالية</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th className={th}>النوع</th><th className={th}>البند</th><th className={th}>المبلغ د.إ</th><th className={th}>التاريخ</th></tr></thead>
            <tbody>
              {farm.sales.map((s) => (
                <tr key={s.id}><td className={td}>بيع</td><td className={td}>{s.item}</td><td className={td} dir="ltr">{fmt.format(s.amount)}</td><td className={td} dir="ltr">{s.date}</td></tr>
              ))}
              {farm.costs.map((c) => (
                <tr key={c.id}><td className={td}>مصروف</td><td className={td}>{c.item}</td><td className={td} dir="ltr">{fmt.format(c.amount)}</td><td className={td} dir="ltr">{c.date}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {farm.docs.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, marginTop: 12 }}>التراخيص ({farm.docs.length})</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th className={th}>الترخيص</th><th className={th}>الانتهاء</th></tr></thead>
            <tbody>
              {farm.docs.map((d) => (
                <tr key={d.id}><td className={td}>{d.name}</td><td className={td} dir="ltr">{d.expiry || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
