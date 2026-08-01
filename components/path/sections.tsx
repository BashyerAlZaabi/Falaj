"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useFarm } from "@/components/farm/use-farm";
import { buildRoadmap } from "@/lib/domain/phases";
import { FEDERAL_ENTITIES, LOCAL_ENTITIES } from "@/lib/domain/entities";
import { FUNDS, type FundKind } from "@/lib/domain/funds";
import { ArcGauge } from "@/components/signature/arc-gauge";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { Pill } from "@/components/ui/pill";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

export type PathProfile = { emirate: string | null; activity: string | null };

const inputCls =
  "rounded-md border border-ink-24 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-falaj focus:ring-2 focus:ring-falaj/20";
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/* ---------- خارطة الطريق ---------- */
export function RoadmapSection({ profile }: { profile: PathProfile }) {
  const { farm, loading, mutate } = useFarm();
  if (loading) return <SkeletonCard />;

  const phases = buildRoadmap(profile.emirate, profile.activity);
  const allSteps = phases.flatMap((p) => p.steps);
  const done = farm.roadmap_done.filter((id) => allSteps.some((s) => s.id === id));
  const readiness = allSteps.length ? Math.round((100 * done.length) / allSteps.length) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-lg bg-abyss-2 p-4">
        <ArcGauge value={readiness} label="الجاهزية" size={110} dark />
        <div className="text-white">
          <p className="display text-lg">{profile.activity || "مشروعك"}</p>
          <p className="text-sm text-white/70">
            {profile.emirate || "—"} · أنجزت {done.length} من {allSteps.length} خطوة
          </p>
        </div>
      </div>

      {phases.map((phase) => (
        <section key={phase.key} className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm">{phase.title}</h2>
          <ul className="mt-2 space-y-2">
            {phase.steps.map((s) => {
              const checked = farm.roadmap_done.includes(s.id);
              return (
                <li key={s.id} className="flex items-start gap-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={s.title}
                    onClick={() =>
                      mutate((d) => {
                        d.roadmap_done = checked
                          ? d.roadmap_done.filter((x) => x !== s.id)
                          : [...d.roadmap_done, s.id];
                      })
                    }
                    className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-sm border text-[0.65rem] font-bold transition-colors duration-200 ease-e ${
                      checked ? "border-falaj bg-falaj text-ink" : "border-ink-24 bg-white text-transparent"
                    }`}
                  >
                    ✓
                  </button>
                  <div>
                    <p className={`text-sm ${checked ? "text-ink-45 line-through" : "text-ink"}`}>
                      {s.title}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-45">
                      {s.federal && <Pill label="اتحادي" tone="good" />}
                      {s.entity}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------- الدعم والتمويل ---------- */
export function FundsSection() {
  const kinds: FundKind[] = ["تمويل", "منح ودعم", "حاضنات ومسرعات"];
  return (
    <div className="space-y-4">
      {kinds.map((k) => (
        <section key={k}>
          <h2 className="mb-2 text-sm">{k}</h2>
          <ul className="space-y-2">
            {FUNDS.filter((f) => f.kind === k).map((f) => (
              <li key={f.name} className="rounded-lg bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-ink">{f.name}</p>
                <p className="mt-0.5 text-xs text-ink-45">{f.scope}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Note>
        الشروط والبرامج تتغيّر — اسأل المساعد «شو برامج التمويل المتاحة لي؟» وبيجيب لك آخر
        التفاصيل ببحث حي.
      </Note>
    </div>
  );
}

/* ---------- الشراكات (listings) ---------- */
type Listing = {
  id: string;
  owner: string;
  emirate: string | null;
  activity: string | null;
  area_m2: number | null;
  goal: string | null;
  body: string | null;
  status: string;
};

export function PartnersSection({ profile }: { profile: PathProfile }) {
  const toast = useToast();
  const [mine, setMine] = useState<Listing[]>([]);
  const [open, setOpen] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState("");
  const [uid, setUid] = useState<string | null>(null);

  async function refresh() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUid(user.id);
    const [m, o] = await Promise.all([
      supabase.from("listings").select("*").eq("owner", user.id).order("created_at", { ascending: false }),
      supabase.from("listings").select("*").eq("status", "open").neq("owner", user.id).order("created_at", { ascending: false }),
    ]);
    setMine((m.data as Listing[]) ?? []);
    setOpen((o.data as Listing[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) return <SkeletonCard />;

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-sm">اعرض شراكة</h2>
        <div className="mt-2 space-y-2">
          <input className={`${inputCls} w-full`} placeholder="الهدف: شريك تشغيل، مستثمر، تأجير…" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="هدف الشراكة" />
          <textarea className={`${inputCls} w-full`} rows={2} placeholder="وصف مختصر لعرضك" value={body} onChange={(e) => setBody(e.target.value)} aria-label="وصف العرض" />
          <div className="flex gap-2">
            <input className={`${inputCls} w-32`} placeholder="المساحة م² (اختياري)" value={area} onChange={(e) => setArea(e.target.value)} inputMode="decimal" dir="ltr" aria-label="المساحة" />
            <button
              type="button"
              disabled={!goal.trim() || !uid}
              className="rounded-full bg-falaj px-4 py-2 text-sm font-semibold text-ink transition-colors duration-200 ease-e hover:bg-falaj-d disabled:opacity-50"
              onClick={async () => {
                const supabase = createClient();
                const { error } = await supabase.from("listings").insert({
                  owner: uid,
                  emirate: profile.emirate,
                  activity: profile.activity,
                  area_m2: Number(area) > 0 ? Number(area) : null,
                  goal: goal.trim(),
                  body: body.trim() || null,
                  status: "open",
                });
                if (error) toast({ message: "تعذّر النشر — جرّب مرة ثانية" });
                else {
                  toast({ message: "انعرض عرضك للشركاء" });
                  setGoal(""); setBody(""); setArea("");
                  void refresh();
                }
              }}
            >
              انشر
            </button>
          </div>
        </div>
      </section>

      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm">عروضي</h2>
          <ul className="space-y-2">
            {mine.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{l.goal}</p>
                    <Pill label={l.status === "open" ? "منشور" : "مسودة"} tone={l.status === "open" ? "good" : "neutral"} />
                  </div>
                  {l.body && <p className="text-xs text-ink-45">{l.body}</p>}
                </div>
                <button
                  type="button"
                  className="rounded-full border border-rust/40 px-3 py-1 text-xs font-semibold text-rust hover:bg-rust/5"
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.from("listings").delete().eq("id", l.id);
                    toast({ message: "انحذف العرض" });
                    void refresh();
                  }}
                >
                  حذف
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm">عروض مفتوحة من الأعضاء</h2>
        {open.length === 0 ? (
          <EmptyState title="ما في عروض مفتوحة حالياً" hint="أول ما ينشر الأعضاء عروضهم بتشوفها هنا" />
        ) : (
          <ul className="space-y-2">
            {open.map((l) => (
              <li key={l.id} className="rounded-lg bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-ink">{l.goal}</p>
                <p className="text-xs text-ink-45">
                  {[l.activity, l.emirate, l.area_m2 ? `${fmt.format(l.area_m2)} م²` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {l.body && <p className="mt-1 text-sm text-ink-70">{l.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------- الجهات ---------- */
export function EntitiesSection({ profile }: { profile: PathProfile }) {
  const locals = LOCAL_ENTITIES.filter((e) => !profile.emirate || e.emirate === profile.emirate);
  const others = LOCAL_ENTITIES.filter((e) => profile.emirate && e.emirate !== profile.emirate);

  return (
    <div className="space-y-4">
      <section>
        <h2 className="mb-2 text-sm">الطبقة الاتحادية — تنطبق على كل مشروع</h2>
        <ul className="space-y-2">
          {FEDERAL_ENTITIES.map((e) => (
            <li key={e.name} className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">{e.name}</p>
                <Pill label={e.kind} tone="good" />
              </div>
              <p className="mt-0.5 text-xs text-ink-45">{e.scope}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm">{profile.emirate ? `جهات ${profile.emirate}` : "الجهات المحلية"}</h2>
        {locals.length === 0 ? (
          <EmptyState title="اسأل المساعد عن جهات إمارتك" />
        ) : (
          <ul className="space-y-2">
            {locals.map((e) => (
              <li key={e.name} className="rounded-lg bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{e.name}</p>
                  <Pill label={e.kind} tone={e.kind === "شبه حكومية" ? "warn" : "neutral"} />
                </div>
                <p className="mt-0.5 text-xs text-ink-45">{e.scope}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-ink-45">
            جهات باقي الإمارات ({others.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {others.map((e) => (
              <li key={e.name} className="rounded-lg bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{e.name}</p>
                  <Pill label={e.kind} tone="neutral" />
                </div>
                <p className="mt-0.5 text-xs text-ink-45">{e.emirate} · {e.scope}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Note>
        هذي نقطة انطلاق — كل خدمة حكومية وتفاصيلها المحدثة يجيبها المساعد ببحث حي، فاسأله
        مثلاً: «شو أحتاج لرخصة {profile.activity || "نشاطي"} في {profile.emirate || "إمارتي"}؟»
      </Note>
    </div>
  );
}

/* ---------- المكافآت ---------- */
export function RewardsSection() {
  const { farm, loading } = useFarm();
  if (loading) return <SkeletonCard />;

  const doneTasks = farm.tasks.filter((t) => t.done).length;
  const points =
    doneTasks * 10 +
    farm.harvests.length * 20 +
    farm.sales.length * 5 +
    farm.docs.length * 15 +
    farm.plots.length * 10 +
    farm.roadmap_done.length * 25;

  const levels = [
    { name: "سفير جديد", at: 0 },
    { name: "سفير برونزي", at: 100 },
    { name: "سفير فضي", at: 300 },
    { name: "سفير ذهبي", at: 700 },
  ];
  const level = [...levels].reverse().find((l) => points >= l.at)!;
  const next = levels.find((l) => l.at > points);
  const progress = next ? Math.round((100 * points) / next.at) : 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-lg bg-abyss-2 p-4 text-white">
        <ArcGauge value={progress} label={level.name} size={110} dark />
        <div>
          <p className="display text-2xl" dir="ltr">{fmt.format(points)}</p>
          <p className="text-sm text-white/70">
            نقطة{next ? ` · باقي ${fmt.format(next.at - points)} لـ${next.name}` : " · أعلى مستوى 🎉"}
          </p>
        </div>
      </div>

      <ul className="space-y-1.5 text-sm">
        <li className="flex justify-between rounded-md bg-white px-4 py-2.5 shadow-sm"><span>مهام منجزة ×10</span><b dir="ltr">{doneTasks * 10}</b></li>
        <li className="flex justify-between rounded-md bg-white px-4 py-2.5 shadow-sm"><span>حصادات ×20</span><b dir="ltr">{farm.harvests.length * 20}</b></li>
        <li className="flex justify-between rounded-md bg-white px-4 py-2.5 shadow-sm"><span>مبيعات ×5</span><b dir="ltr">{farm.sales.length * 5}</b></li>
        <li className="flex justify-between rounded-md bg-white px-4 py-2.5 shadow-sm"><span>تراخيص ×15</span><b dir="ltr">{farm.docs.length * 15}</b></li>
        <li className="flex justify-between rounded-md bg-white px-4 py-2.5 shadow-sm"><span>قطع ×10</span><b dir="ltr">{farm.plots.length * 10}</b></li>
        <li className="flex justify-between rounded-md bg-white px-4 py-2.5 shadow-sm"><span>خطوات خارطة الطريق ×25</span><b dir="ltr">{farm.roadmap_done.length * 25}</b></li>
      </ul>

      <Note>النقاط تُحسب تلقائياً من نشاطك الفعلي في التطبيق — كل ما اشتغلت أكثر، ارتفعت.</Note>
    </div>
  );
}
