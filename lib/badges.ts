import { type SupabaseClient } from "@supabase/supabase-js";
import { normalizeFarm } from "@/lib/farm/data";
import { type Badges } from "@/lib/domain/nav";

const DAY = 24 * 60 * 60 * 1000;

/**
 * شارات البنود المتأخرة من الحالة الحية (PROMPT §6):
 * مهام متأخرة، تراخيص تنتهي خلال ٣٠ يوماً، مخزون تحت الحد.
 */
export async function computeBadges(
  supabase: SupabaseClient,
  userId: string,
): Promise<Badges> {
  const { data } = await supabase
    .from("farms")
    .select("data")
    .eq("owner", userId)
    .maybeSingle();

  const farm = normalizeFarm(data?.data);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);

  const overdueTasks = farm.tasks.filter((t) => !t.done && t.due && t.due < today).length;
  const expiringDocs = farm.docs.filter((d) => d.expiry && d.expiry <= soon).length;
  const lowStock = farm.stock.filter((s) => s.min_qty > 0 && s.qty <= s.min_qty).length;

  const farmTotal = overdueTasks + expiringDocs + lowStock;

  return {
    main: { today: farmTotal, farm: farmTotal },
    farm: {
      tasks: overdueTasks,
      docs: expiringDocs,
      stock: lowStock,
    },
    path: {},
  };
}
