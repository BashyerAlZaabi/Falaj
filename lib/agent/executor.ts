"use client";

import { uid, type FarmData } from "@/lib/farm/data";

/**
 * تنفيذ أدوات المساعد محلياً على بيانات المزرعة (PROMPT §7).
 * كل أداة تُرجع سطراً عربياً يُعرض في المحادثة: نُفّذ / تعذّر.
 */

export type ToolOutcome = {
  ok: boolean;
  message: string;
  /** تنقّل مطلوب (open_module) */
  navigate?: string;
  /** تنزيل نسخة احتياطية */
  download?: boolean;
  /** طباعة */
  print?: boolean;
  /** هل تغيّرت بيانات المزرعة؟ */
  mutated: boolean;
};

const MODULE_ROUTES: Record<string, string> = {
  today: "/today",
  land: "/farm/land",
  plots: "/farm/plots",
  crops: "/farm/crops",
  tasks: "/farm/tasks",
  stock: "/farm/stock",
  sensors: "/farm/sensors",
  money: "/farm/money",
  docs: "/farm/docs",
  roadmap: "/path/roadmap",
  funds: "/path/funds",
  partners: "/path/partners",
  entities: "/path/entities",
  rewards: "/path/rewards",
  assistant: "/assistant",
};

const today = () => new Date().toISOString().slice(0, 10);
const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : NaN);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function executeTool(
  name: string,
  input: Record<string, unknown>,
  farm: FarmData,
): ToolOutcome {
  switch (name) {
    case "add_plot": {
      const plotName = str(input.name);
      const area = num(input.area_m2);
      if (!plotName || !(area > 0))
        return { ok: false, message: "تعذّر: بيانات القطعة ناقصة", mutated: false };
      farm.plots.push({ id: uid(), name: plotName, area_m2: area });
      return { ok: true, message: `نُفّذ: أُضيفت ${plotName} (${area} م²)`, mutated: true };
    }

    case "add_cycle": {
      const crop = str(input.crop);
      if (!crop) return { ok: false, message: "تعذّر: ما في اسم محصول", mutated: false };
      const plotName = str(input.plot_name);
      const plot = plotName
        ? farm.plots.find((p) => p.name.includes(plotName))
        : farm.plots[farm.plots.length - 1];
      const days = num(input.harvest_days);
      farm.cycles.push({
        id: uid(),
        plot_id: plot?.id ?? null,
        crop,
        start: today(),
        harvest_days: isFinite(days) ? days : null,
        status: "active",
      });
      return {
        ok: true,
        message: `نُفّذ: بدأت دورة ${crop}${plot ? ` على ${plot.name}` : ""}`,
        mutated: true,
      };
    }

    case "add_task": {
      const title = str(input.title);
      if (!title) return { ok: false, message: "تعذّر: ما في نص للمهمة", mutated: false };
      const due = str(input.due) || null;
      farm.tasks.push({ id: uid(), title, due, done: false });
      return { ok: true, message: `نُفّذ: أُضيفت مهمة «${title}»`, mutated: true };
    }

    case "complete_task": {
      const title = str(input.title);
      const task = farm.tasks.find((t) => !t.done && t.title.includes(title));
      if (!task)
        return { ok: false, message: `تعذّر: ما لقيت مهمة مفتوحة تطابق «${title}»`, mutated: false };
      task.done = true;
      return { ok: true, message: `نُفّذ: سُكّرت «${task.title}»`, mutated: true };
    }

    case "add_stock": {
      const name_ = str(input.name);
      const qty = num(input.qty);
      const unit = str(input.unit);
      if (!name_ || !isFinite(qty) || !unit)
        return { ok: false, message: "تعذّر: بيانات الصنف ناقصة", mutated: false };
      const existing = farm.stock.find((s) => s.name === name_);
      if (existing) {
        existing.qty += qty;
        const min = num(input.min_qty);
        if (isFinite(min)) existing.min_qty = min;
        return { ok: true, message: `نُفّذ: صار ${name_} ${existing.qty} ${unit}`, mutated: true };
      }
      farm.stock.push({
        id: uid(),
        name: name_,
        qty,
        unit,
        min_qty: isFinite(num(input.min_qty)) ? num(input.min_qty) : 0,
      });
      return { ok: true, message: `نُفّذ: أُضيف ${name_} (${qty} ${unit})`, mutated: true };
    }

    case "log_harvest": {
      const crop = str(input.crop);
      const qty = num(input.qty);
      const unit = str(input.unit);
      if (!crop || !(qty > 0) || !unit)
        return { ok: false, message: "تعذّر: بيانات الحصاد ناقصة", mutated: false };
      farm.harvests.push({ id: uid(), crop, qty, unit, date: today() });
      return { ok: true, message: `نُفّذ: سُجّل حصاد ${crop} (${qty} ${unit})`, mutated: true };
    }

    case "log_sale": {
      const item = str(input.item);
      const amount = num(input.amount);
      if (!item || !(amount > 0))
        return { ok: false, message: "تعذّر: بيانات البيع ناقصة", mutated: false };
      farm.sales.push({ id: uid(), item, amount, date: today() });
      return { ok: true, message: `نُفّذ: بيع ${item} بـ ${amount} درهم`, mutated: true };
    }

    case "log_cost": {
      const item = str(input.item);
      const amount = num(input.amount);
      if (!item || !(amount > 0))
        return { ok: false, message: "تعذّر: بيانات المصروف ناقصة", mutated: false };
      farm.costs.push({ id: uid(), item, amount, date: today() });
      return { ok: true, message: `نُفّذ: مصروف ${item} (${amount} درهم)`, mutated: true };
    }

    case "add_doc": {
      const name_ = str(input.name);
      if (!name_) return { ok: false, message: "تعذّر: ما في اسم للوثيقة", mutated: false };
      farm.docs.push({ id: uid(), name: name_, expiry: str(input.expiry) || null });
      return { ok: true, message: `نُفّذ: أُضيف ترخيص «${name_}»`, mutated: true };
    }

    case "backup_data":
      return { ok: true, message: "نُفّذ: جاري تنزيل النسخة الاحتياطية", download: true, mutated: false };

    case "print_report":
      return { ok: true, message: "نُفّذ: جاري فتح الطباعة", print: true, mutated: false };

    case "open_module": {
      const route = MODULE_ROUTES[str(input.module)];
      if (!route) return { ok: false, message: "تعذّر: قسم غير معروف", mutated: false };
      return { ok: true, message: "نُفّذ: جاري الفتح", navigate: route, mutated: false };
    }

    default:
      return { ok: false, message: `تعذّر: أداة غير معروفة (${name})`, mutated: false };
  }
}

/** تنزيل بيانات المزرعة كملف JSON. */
export function downloadBackup(farm: FarmData) {
  const blob = new Blob([JSON.stringify(farm, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `falaj-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
