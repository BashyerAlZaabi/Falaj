"use client";

import { createClient } from "@/lib/supabase/client";
import { emptyFarm, normalizeFarm, type FarmData } from "./data";

/** تحميل بيانات المزرعة من صف farms (jsonb) — أو مزرعة فاضية. */
export async function loadFarm(): Promise<FarmData> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyFarm();

  const { data } = await supabase
    .from("farms")
    .select("data")
    .eq("owner", user.id)
    .maybeSingle();

  return normalizeFarm(data?.data);
}

/** حفظ بيانات المزرعة (upsert على صف المالك). */
export async function saveFarm(farm: FarmData): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("farms").upsert({
    owner: user.id,
    data: farm,
    updated_at: new Date().toISOString(),
  });
  return !error;
}
