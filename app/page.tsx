import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** «اليوم» هي الرئيسية — وملف ناقص يمر بالاستقبال أولاً. */
export default async function Root() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("activity, emirate")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.activity || !profile?.emirate) redirect("/onboarding");
  redirect("/today");
}
