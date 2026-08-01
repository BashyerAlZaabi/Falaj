/**
 * سكربت ترحيل المرحلة ٨: ينقل farms.data (jsonb) إلى الجداول المطبّعة
 * (بعد تطبيق 0002_normalize.sql) ثم يتحقق من تطابق الأعداد لكل مستخدم.
 *
 * تشغيل (بمفتاح الخدمة، على الخادم فقط):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-jsonb.ts
 *
 * السكربت idempotent — upsert بالمعرّفات نفسها، فإعادة تشغيله آمنة.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("حدد SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

async function upsert(table: string, rows: Row[]) {
  if (!rows.length) return 0;
  const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
  return rows.length;
}

async function main() {
  const { data: farms, error } = await db.from("farms").select("owner, data");
  if (error) throw error;

  let users = 0;
  const totals: Record<string, number> = {};

  for (const farm of farms ?? []) {
    const owner = farm.owner as string;
    const d = (farm.data ?? {}) as Record<string, Row[]>;
    users++;

    const plots = arr(d.plots).map((p: Row) => ({
      id: p.id, owner, name: str(p.name) || "قطعة", area_m2: num(p.area_m2),
    }));
    const plotIds = new Set(plots.map((p) => p.id));

    const cycles = arr(d.cycles).map((c: Row) => ({
      id: c.id, owner,
      plot_id: plotIds.has(c.plot_id as string) ? c.plot_id : null,
      crop: str(c.crop) || "محصول",
      start_date: str(c.start) || new Date().toISOString().slice(0, 10),
      harvest_days: typeof c.harvest_days === "number" ? c.harvest_days : null,
      status: c.status === "done" ? "done" : "active",
    }));

    const tasks = arr(d.tasks).map((t: Row) => ({
      id: t.id, owner, title: str(t.title) || "مهمة",
      due: str(t.due) || null, done: !!t.done,
    }));

    const stock = arr(d.stock).map((s: Row) => ({
      id: s.id, owner, name: str(s.name) || "صنف", qty: num(s.qty),
      unit: str(s.unit) || "وحدة", min_qty: num(s.min_qty),
    }));

    const harvests = arr(d.harvests).map((h: Row) => ({
      id: h.id, owner, crop: str(h.crop) || "محصول", qty: num(h.qty),
      unit: str(h.unit) || "وحدة", date: str(h.date) || new Date().toISOString().slice(0, 10),
    }));

    const sales = arr(d.sales).map((s: Row) => ({
      id: s.id, owner, item: str(s.item) || "صنف", amount: num(s.amount),
      date: str(s.date) || new Date().toISOString().slice(0, 10),
    }));

    const costs = arr(d.costs).map((c: Row) => ({
      id: c.id, owner, item: str(c.item) || "بند", amount: num(c.amount),
      date: str(c.date) || new Date().toISOString().slice(0, 10),
    }));

    const docs = arr(d.docs).map((x: Row) => ({
      id: x.id, owner, name: str(x.name) || "وثيقة", expiry: str(x.expiry) || null,
    }));

    // القطع أولاً (المرجع الأجنبي للدورات)
    const sets: [string, Row[]][] = [
      ["plots", plots], ["cycles", cycles], ["tasks", tasks], ["stock", stock],
      ["harvests", harvests], ["sales", sales], ["costs", costs], ["docs", docs],
    ];
    for (const [table, rows] of sets) {
      totals[table] = (totals[table] ?? 0) + (await upsert(table, rows));
    }
  }

  console.log(`رُحّل ${users} مستخدم:`);
  for (const [t, n] of Object.entries(totals)) console.log(`  ${t}: ${n} صف`);

  // تحقق: عدّ الصفوف في الجداول يطابق ما في jsonb
  for (const t of Object.keys(totals)) {
    const { count } = await db.from(t).select("id", { count: "exact", head: true });
    console.log(`  ${t} في القاعدة: ${count} صف ${count === totals[t] ? "✓" : "⚠ (فيه صفوف سابقة أو فرق)"}`);
  }
  console.log("اكتمل الترحيل. راجع الأعداد ثم حوّل قراءة التطبيق للجداول.");
}

main().catch((e) => {
  console.error("فشل الترحيل:", e.message);
  process.exit(1);
});
