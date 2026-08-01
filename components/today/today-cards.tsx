"use client";

import Link from "next/link";
import { useFarm } from "@/components/farm/use-farm";
import { type ProfileContext } from "@/lib/agent/context";
import { AgentReading } from "./agent-reading";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { SkeletonCard } from "@/components/ui/skeleton";

const DAY = 24 * 60 * 60 * 1000;

/**
 * بطاقات «اليوم» مرتبة بالإلحاح (PROMPT §6):
 * مهام متأخرة (تُسكَّر من البطاقة) ← مهام اليوم ← تراخيص توشك ← مخزون
 * تحت الحد ← محاصيل قرب حصادها ← المرحلة الحالية. وإلا: «ما في شي عالق».
 */
export function TodayCards({ profile }: { profile: ProfileContext }) {
  const { farm, loading, mutate } = useFarm();

  if (loading)
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);

  const overdue = farm.tasks.filter((t) => !t.done && t.due && t.due < today);
  const dueToday = farm.tasks.filter((t) => !t.done && t.due === today);
  const expiring = farm.docs.filter((d) => d.expiry && d.expiry <= soon);
  const low = farm.stock.filter((s) => s.min_qty > 0 && s.qty <= s.min_qty);
  const nearHarvest = farm.cycles.filter((c) => {
    if (c.status !== "active" || !c.harvest_days) return false;
    const h = new Date(new Date(c.start).getTime() + c.harvest_days * DAY)
      .toISOString()
      .slice(0, 10);
    return h <= week;
  });

  const nothing =
    !overdue.length && !dueToday.length && !expiring.length && !low.length && !nearHarvest.length;

  async function closeTask(id: string) {
    await mutate((d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (t) t.done = true;
    });
  }

  return (
    <div className="space-y-3">
      <AgentReading profile={profile} farm={farm} />

      {overdue.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border-s-4 border-rust bg-white p-4 shadow-sm">
          <div>
            <Pill label="متأخرة" tone="bad" />
            <p className="mt-1.5 text-sm font-medium text-ink">{t.title}</p>
            <p className="text-xs text-ink-45" dir="ltr">{t.due}</p>
          </div>
          <button
            type="button"
            onClick={() => closeTask(t.id)}
            className="rounded-full border border-ink-24 px-4 py-1.5 text-xs font-semibold text-ink-70 transition-colors duration-200 ease-e hover:bg-sand-l"
          >
            سكّرها
          </button>
        </div>
      ))}

      {dueToday.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm">
          <div>
            <Pill label="اليوم" tone="warn" />
            <p className="mt-1.5 text-sm font-medium text-ink">{t.title}</p>
          </div>
          <button
            type="button"
            onClick={() => closeTask(t.id)}
            className="rounded-full border border-ink-24 px-4 py-1.5 text-xs font-semibold text-ink-70 transition-colors duration-200 ease-e hover:bg-sand-l"
          >
            سكّرها
          </button>
        </div>
      ))}

      {expiring.map((d) => (
        <Link key={d.id} href="/farm/docs" className="block rounded-lg bg-white p-4 shadow-sm transition-transform duration-200 ease-e hover:-translate-y-0.5">
          <Pill label="ترخيص" tone="warn" />
          <p className="mt-1.5 text-sm font-medium text-ink">{d.name} يوشك ينتهي</p>
          <p className="text-xs text-ink-45" dir="ltr">{d.expiry}</p>
        </Link>
      ))}

      {low.map((s) => (
        <Link key={s.id} href="/farm/stock" className="block rounded-lg bg-white p-4 shadow-sm transition-transform duration-200 ease-e hover:-translate-y-0.5">
          <Pill label="مخزون" tone="warn" />
          <p className="mt-1.5 text-sm font-medium text-ink">
            {s.name} تحت الحد ({s.qty} {s.unit})
          </p>
        </Link>
      ))}

      {nearHarvest.map((c) => (
        <Link key={c.id} href="/farm/crops" className="block rounded-lg bg-white p-4 shadow-sm transition-transform duration-200 ease-e hover:-translate-y-0.5">
          <Pill label="حصاد" tone="good" />
          <p className="mt-1.5 text-sm font-medium text-ink">{c.crop} قرب موعد حصاده</p>
        </Link>
      ))}

      {nothing && (
        <EmptyState title="ما في شي عالق" hint="كل شي تمام — كمّل على خارطة الطريق" />
      )}

      <Link
        href="/path/roadmap"
        className="block rounded-lg bg-abyss-2 p-4 text-white transition-transform duration-200 ease-e hover:-translate-y-0.5"
      >
        <p className="text-xs font-semibold text-falaj-l">مرحلتك الحالية</p>
        <p className="mt-1 text-sm">
          {profile.stage ? `مشروعك في مرحلة «${profile.stage}» — شوف خطواتك الجاية` : "حدّد مرحلتك من خارطة الطريق"}
        </p>
      </Link>
    </div>
  );
}
