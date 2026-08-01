"use client";

import { createClient } from "@/lib/supabase/client";

export type ProfileUpdate = {
  activity: string;
  emirate: string;
  stage: string;
};

/** حفظ ملف الاستقبال في profiles (النشاط والإمارة، والمرحلة داخل answers). */
export async function saveProfile(p: ProfileUpdate): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: existing } = await supabase
    .from("profiles")
    .select("answers")
    .eq("id", user.id)
    .maybeSingle();

  const answers = {
    ...((existing?.answers as Record<string, unknown>) ?? {}),
    stage: p.stage,
  };

  const { error } = await supabase
    .from("profiles")
    .update({ activity: p.activity, emirate: p.emirate, answers })
    .eq("id", user.id);
  return !error;
}
