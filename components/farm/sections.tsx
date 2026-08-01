"use client";

import { useState } from "react";
import { useFarm } from "./use-farm";
import { uid } from "@/lib/farm/data";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { Stat } from "@/components/ui/stat";
import { Note } from "@/components/ui/note";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ArcGauge } from "@/components/signature/arc-gauge";

/* أقسام «مزرعتي» (المرحلة ٥) — كلها على useFarm بحذف قابل للتراجع ٧ ثوانٍ */

const inputCls =
  "rounded-md border border-ink-24 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-falaj focus:ring-2 focus:ring-falaj/20";
const addBtnCls =
  "rounded-full bg-falaj px-4 py-2 text-sm font-semibold text-ink transition-colors duration-200 ease-e hover:bg-falaj-d disabled:opacity-50";
const delBtnCls =
  "rounded-full border border-rust/40 px-3 py-1 text-xs font-semibold text-rust transition-colors duration-200 ease-e hover:bg-rust/5";
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const today = () => new Date().toISOString().slice(0, 10);
const DAY = 24 * 60 * 60 * 1000;

function Loading() {
  return (
    <div className="space-y-3">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

/* ---------- القطع ---------- */
export function PlotsSection() {
  const { farm, loading, mutate, destructive } = useFarm();
  const [name, setName] = useState("");
  const [area, setArea] = useState("");

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className={inputCls} placeholder="اسم القطعة" value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم القطعة" />
        <input className={`${inputCls} w-28`} placeholder="المساحة م²" value={area} onChange={(e) => setArea(e.target.value)} inputMode="decimal" dir="ltr" aria-label="المساحة بالمتر المربع" />
        <button
          type="button"
          className={addBtnCls}
          disabled={!name.trim() || !(Number(area) > 0)}
          onClick={async () => {
            await mutate((d) => d.plots.push({ id: uid(), name: name.trim(), area_m2: Number(area) }));
            setName("");
            setArea("");
          }}
        >
          أضف قطعة
        </button>
      </div>

      {farm.plots.length === 0 ? (
        <EmptyState title="لا قطع بعد" hint="أضف قطعة يدوياً أو ارسم أرضك في «الأرض» وقسّمها" />
      ) : (
        <ul className="space-y-2">
          {farm.plots.map((p) => {
            const cycles = farm.cycles.filter((c) => c.plot_id === p.id);
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-ink">{p.name}</p>
                  <p className="text-xs text-ink-45">
                    <span dir="ltr">{fmt.format(p.area_m2)}</span> م² · {cycles.length} دورة
                  </p>
                </div>
                <button
                  type="button"
                  className={delBtnCls}
                  onClick={() =>
                    destructive(`حُذفت «${p.name}» ودوراتها`, (d) => {
                      d.plots = d.plots.filter((x) => x.id !== p.id);
                      d.cycles = d.cycles.filter((c) => c.plot_id !== p.id);
                    })
                  }
                >
                  حذف
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- الدورات ---------- */
export function CropsSection() {
  const { farm, loading, mutate, destructive } = useFarm();
  const [crop, setCrop] = useState("");
  const [plotId, setPlotId] = useState("");
  const [days, setDays] = useState("");

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className={inputCls} placeholder="المحصول" value={crop} onChange={(e) => setCrop(e.target.value)} aria-label="المحصول" />
        <select className={inputCls} value={plotId} onChange={(e) => setPlotId(e.target.value)} aria-label="القطعة">
          <option value="">بدون قطعة</option>
          {farm.plots.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input className={`${inputCls} w-28`} placeholder="أيام الحصاد" value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" dir="ltr" aria-label="أيام الحصاد" />
        <button
          type="button"
          className={addBtnCls}
          disabled={!crop.trim()}
          onClick={async () => {
            await mutate((d) =>
              d.cycles.push({
                id: uid(),
                plot_id: plotId || null,
                crop: crop.trim(),
                start: today(),
                harvest_days: Number(days) > 0 ? Number(days) : null,
                status: "active",
              }),
            );
            setCrop("");
            setDays("");
          }}
        >
          ابدأ دورة
        </button>
      </div>

      {farm.cycles.length === 0 ? (
        <EmptyState title="لا دورات بعد" hint="ابدأ دورة محصول على إحدى قطعك" />
      ) : (
        <ul className="space-y-2">
          {farm.cycles.map((c) => {
            const plot = farm.plots.find((p) => p.id === c.plot_id);
            const eta = c.harvest_days
              ? new Date(new Date(c.start).getTime() + c.harvest_days * DAY).toISOString().slice(0, 10)
              : null;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{c.crop}</p>
                    <Pill label={c.status === "active" ? "نشطة" : "منتهية"} tone={c.status === "active" ? "good" : "neutral"} />
                  </div>
                  <p className="text-xs text-ink-45">
                    {plot ? `${plot.name} · ` : ""}بدأت <span dir="ltr">{c.start}</span>
                    {eta ? <> · حصاد متوقع <span dir="ltr">{eta}</span></> : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.status === "active" && (
                    <button
                      type="button"
                      className="rounded-full border border-ink-24 px-3 py-1 text-xs font-semibold text-ink-70 hover:bg-sand-l"
                      onClick={() => mutate((d) => { const x = d.cycles.find((y) => y.id === c.id); if (x) x.status = "done"; })}
                    >
                      إنهاء
                    </button>
                  )}
                  <button
                    type="button"
                    className={delBtnCls}
                    onClick={() => destructive(`حُذفت دورة ${c.crop}`, (d) => { d.cycles = d.cycles.filter((x) => x.id !== c.id); })}
                  >
                    حذف
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- المهام ---------- */
export function TasksSection() {
  const { farm, loading, mutate, destructive } = useFarm();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  if (loading) return <Loading />;
  const open = farm.tasks.filter((t) => !t.done);
  const done = farm.tasks.filter((t) => t.done);
  const t0 = today();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className={`${inputCls} flex-1 min-w-40`} placeholder="مهمة جديدة" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="نص المهمة" />
        <input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} dir="ltr" aria-label="تاريخ الاستحقاق" />
        <button
          type="button"
          className={addBtnCls}
          disabled={!title.trim()}
          onClick={async () => {
            await mutate((d) => d.tasks.push({ id: uid(), title: title.trim(), due: due || null, done: false }));
            setTitle("");
            setDue("");
          }}
        >
          أضف
        </button>
      </div>

      {open.length === 0 ? (
        <EmptyState title="لا مهام مفتوحة" hint="أضف مهمة أو اطلبها من المساعد" />
      ) : (
        <ul className="space-y-2">
          {open.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm">
              <div>
                <p className="text-sm font-medium text-ink">{t.title}</p>
                {t.due && (
                  <p className="text-xs text-ink-45">
                    {t.due < t0 ? <Pill label="متأخرة" tone="bad" /> : t.due === t0 ? <Pill label="اليوم" tone="warn" /> : null}{" "}
                    <span dir="ltr">{t.due}</span>
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full border border-ink-24 px-3 py-1 text-xs font-semibold text-ink-70 hover:bg-sand-l"
                  onClick={() => mutate((d) => { const x = d.tasks.find((y) => y.id === t.id); if (x) x.done = true; })}
                >
                  سكّرها
                </button>
                <button
                  type="button"
                  className={delBtnCls}
                  onClick={() => destructive(`حُذفت «${t.title}»`, (d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); })}
                >
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && <p className="text-xs text-ink-45">المنجزة: {done.length}</p>}
    </div>
  );
}

/* ---------- المخزون ---------- */
export function StockSection() {
  const { farm, loading, mutate, destructive } = useFarm();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [min, setMin] = useState("");

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className={inputCls} placeholder="الصنف" value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم الصنف" />
        <input className={`${inputCls} w-20`} placeholder="كمية" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" dir="ltr" aria-label="الكمية" />
        <input className={`${inputCls} w-20`} placeholder="وحدة" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="الوحدة" />
        <input className={`${inputCls} w-24`} placeholder="حد أدنى" value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" dir="ltr" aria-label="الحد الأدنى" />
        <button
          type="button"
          className={addBtnCls}
          disabled={!name.trim() || !unit.trim() || !isFinite(Number(qty))}
          onClick={async () => {
            await mutate((d) =>
              d.stock.push({ id: uid(), name: name.trim(), qty: Number(qty), unit: unit.trim(), min_qty: Number(min) > 0 ? Number(min) : 0 }),
            );
            setName(""); setQty(""); setUnit(""); setMin("");
          }}
        >
          أضف
        </button>
      </div>

      {farm.stock.length === 0 ? (
        <EmptyState title="المخزون فاضي" hint="سجّل البذور والسماد والمستلزمات هنا" />
      ) : (
        <ul className="space-y-2">
          {farm.stock.map((s) => {
            const low = s.min_qty > 0 && s.qty <= s.min_qty;
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{s.name}</p>
                    {low && <Pill label="تحت الحد" tone="bad" />}
                  </div>
                  <p className="text-xs text-ink-45">
                    <span dir="ltr">{fmt.format(s.qty)}</span> {s.unit}
                    {s.min_qty > 0 && <> · الحد <span dir="ltr">{fmt.format(s.min_qty)}</span></>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-label={`زد ${s.name}`} className="h-7 w-7 rounded-full border border-ink-24 text-sm font-bold text-ink-70 hover:bg-sand-l" onClick={() => mutate((d) => { const x = d.stock.find((y) => y.id === s.id); if (x) x.qty += 1; })}>+</button>
                  <button type="button" aria-label={`أنقص ${s.name}`} className="h-7 w-7 rounded-full border border-ink-24 text-sm font-bold text-ink-70 hover:bg-sand-l" onClick={() => mutate((d) => { const x = d.stock.find((y) => y.id === s.id); if (x && x.qty > 0) x.qty -= 1; })}>−</button>
                  <button type="button" className={delBtnCls} onClick={() => destructive(`حُذف ${s.name}`, (d) => { d.stock = d.stock.filter((x) => x.id !== s.id); })}>حذف</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- الحساسات (بيانات تجريبية حتى ربط الأجهزة) ---------- */
export function SensorsSection() {
  const { farm, loading } = useFarm();
  if (loading) return <Loading />;

  // قراءات تجريبية مستقرة خلال الساعة — تتبدل كل ساعة
  const seed = Math.floor(Date.now() / 3600_000);
  const moisture = 38 + (seed % 25);
  const temp = 24 + (seed % 12);
  const ec = (1.2 + ((seed * 7) % 10) / 10).toFixed(1);

  return (
    <div className="space-y-4">
      <Note tone="warn">
        قراءات تجريبية للعرض — اربط حساسات الري الفعلية لاحقاً لتشوف بياناتك الحية هنا.
      </Note>
      <div className="flex items-center justify-center rounded-lg bg-white p-4 shadow-sm">
        <ArcGauge value={moisture} label="رطوبة التربة" size={140} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="حرارة التربة" value={temp} unit="°م" />
        <Stat label="الملوحة EC" value={ec} unit="dS/m" />
        <Stat label="قطع مغطاة" value={farm.plots.length ? Math.min(farm.plots.length, 2) : 0} unit={`من ${farm.plots.length}`} />
        <Stat label="ريّات اليوم" value={2} hint="مجدولة تلقائياً" />
      </div>
    </div>
  );
}

/* ---------- المالية ---------- */
export function MoneySection() {
  const { farm, loading, mutate, destructive } = useFarm();
  const [saleItem, setSaleItem] = useState("");
  const [saleAmt, setSaleAmt] = useState("");
  const [costItem, setCostItem] = useState("");
  const [costAmt, setCostAmt] = useState("");

  if (loading) return <Loading />;
  const revenue = farm.sales.reduce((a, s) => a + s.amount, 0);
  const costs = farm.costs.reduce((a, c) => a + c.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="الإيراد" value={fmt.format(revenue)} unit="د.إ" />
        <Stat label="المصاريف" value={fmt.format(costs)} unit="د.إ" />
        <Stat label="الصافي" value={fmt.format(revenue - costs)} unit="د.إ" />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm">المبيعات</h2>
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} flex-1 min-w-32`} placeholder="الصنف" value={saleItem} onChange={(e) => setSaleItem(e.target.value)} aria-label="الصنف المباع" />
          <input className={`${inputCls} w-28`} placeholder="المبلغ د.إ" value={saleAmt} onChange={(e) => setSaleAmt(e.target.value)} inputMode="decimal" dir="ltr" aria-label="مبلغ البيع" />
          <button type="button" className={addBtnCls} disabled={!saleItem.trim() || !(Number(saleAmt) > 0)}
            onClick={async () => { await mutate((d) => d.sales.push({ id: uid(), item: saleItem.trim(), amount: Number(saleAmt), date: today() })); setSaleItem(""); setSaleAmt(""); }}>
            سجّل بيع
          </button>
        </div>
        {farm.sales.length === 0 ? (
          <EmptyState title="لا مبيعات بعد" />
        ) : (
          <ul className="space-y-1.5">
            {farm.sales.slice().reverse().map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-md bg-white px-4 py-2.5 text-sm shadow-sm">
                <span className="text-ink">{s.item}</span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold text-ink" dir="ltr">{fmt.format(s.amount)} د.إ</span>
                  <button type="button" className={delBtnCls} onClick={() => destructive(`حُذف بيع ${s.item}`, (d) => { d.sales = d.sales.filter((x) => x.id !== s.id); })}>حذف</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm">المصاريف</h2>
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} flex-1 min-w-32`} placeholder="البند" value={costItem} onChange={(e) => setCostItem(e.target.value)} aria-label="بند المصروف" />
          <input className={`${inputCls} w-28`} placeholder="المبلغ د.إ" value={costAmt} onChange={(e) => setCostAmt(e.target.value)} inputMode="decimal" dir="ltr" aria-label="مبلغ المصروف" />
          <button type="button" className={addBtnCls} disabled={!costItem.trim() || !(Number(costAmt) > 0)}
            onClick={async () => { await mutate((d) => d.costs.push({ id: uid(), item: costItem.trim(), amount: Number(costAmt), date: today() })); setCostItem(""); setCostAmt(""); }}>
            سجّل مصروف
          </button>
        </div>
        {farm.costs.length === 0 ? (
          <EmptyState title="لا مصاريف بعد" />
        ) : (
          <ul className="space-y-1.5">
            {farm.costs.slice().reverse().map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md bg-white px-4 py-2.5 text-sm shadow-sm">
                <span className="text-ink">{c.item}</span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold text-ink" dir="ltr">{fmt.format(c.amount)} د.إ</span>
                  <button type="button" className={delBtnCls} onClick={() => destructive(`حُذف مصروف ${c.item}`, (d) => { d.costs = d.costs.filter((x) => x.id !== c.id); })}>حذف</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------- التراخيص ---------- */
export function DocsSection() {
  const { farm, loading, mutate, destructive } = useFarm();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");

  if (loading) return <Loading />;
  const soon = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  const t0 = today();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className={`${inputCls} flex-1 min-w-40`} placeholder="اسم الترخيص" value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم الترخيص" />
        <input type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} dir="ltr" aria-label="تاريخ الانتهاء" />
        <button
          type="button"
          className={addBtnCls}
          disabled={!name.trim()}
          onClick={async () => {
            await mutate((d) => d.docs.push({ id: uid(), name: name.trim(), expiry: expiry || null }));
            setName(""); setExpiry("");
          }}
        >
          أضف
        </button>
      </div>

      {farm.docs.length === 0 ? (
        <EmptyState title="لا تراخيص مسجّلة" hint="سجّل تراخيصك وتواريخها عشان ننبهك قبل الانتهاء" />
      ) : (
        <ul className="space-y-2">
          {farm.docs.map((d0) => {
            const expired = d0.expiry && d0.expiry < t0;
            const expiring = d0.expiry && !expired && d0.expiry <= soon;
            return (
              <li key={d0.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{d0.name}</p>
                    {expired && <Pill label="منتهٍ" tone="bad" />}
                    {expiring && <Pill label="يوشك" tone="warn" />}
                  </div>
                  {d0.expiry && <p className="text-xs text-ink-45" dir="ltr">{d0.expiry}</p>}
                </div>
                <button type="button" className={delBtnCls} onClick={() => destructive(`حُذف «${d0.name}»`, (d) => { d.docs = d.docs.filter((x) => x.id !== d0.id); })}>حذف</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
