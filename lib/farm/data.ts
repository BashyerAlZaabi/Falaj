/**
 * بيانات المزرعة — jsonb في صف واحد بجدول farms (قرار مقصود، PROMPT §4).
 * التطبيع إلى جداول يتم في المرحلة ٨ فقط.
 */

export type Plot = { id: string; name: string; area_m2: number };
export type Cycle = {
  id: string;
  plot_id: string | null;
  crop: string;
  start: string; // ISO date
  harvest_days: number | null;
  status: "active" | "done";
};
export type Task = {
  id: string;
  title: string;
  due: string | null; // ISO date
  done: boolean;
};
export type StockItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  min_qty: number;
};
export type Harvest = { id: string; crop: string; qty: number; unit: string; date: string };
export type Sale = { id: string; item: string; amount: number; date: string };
export type Cost = { id: string; item: string; amount: number; date: string };
export type FarmDoc = { id: string; name: string; expiry: string | null };

export type FarmData = {
  plots: Plot[];
  cycles: Cycle[];
  tasks: Task[];
  stock: StockItem[];
  harvests: Harvest[];
  sales: Sale[];
  costs: Cost[];
  docs: FarmDoc[];
};

export function emptyFarm(): FarmData {
  return {
    plots: [],
    cycles: [],
    tasks: [],
    stock: [],
    harvests: [],
    sales: [],
    costs: [],
    docs: [],
  };
}

/** يضمن أن أي jsonb قادم من القاعدة يحمل كل الحقول. */
export function normalizeFarm(data: unknown): FarmData {
  const d = (data ?? {}) as Partial<FarmData>;
  const base = emptyFarm();
  return {
    plots: Array.isArray(d.plots) ? d.plots : base.plots,
    cycles: Array.isArray(d.cycles) ? d.cycles : base.cycles,
    tasks: Array.isArray(d.tasks) ? d.tasks : base.tasks,
    stock: Array.isArray(d.stock) ? d.stock : base.stock,
    harvests: Array.isArray(d.harvests) ? d.harvests : base.harvests,
    sales: Array.isArray(d.sales) ? d.sales : base.sales,
    costs: Array.isArray(d.costs) ? d.costs : base.costs,
    docs: Array.isArray(d.docs) ? d.docs : base.docs,
  };
}

export function uid(): string {
  return crypto.randomUUID();
}
