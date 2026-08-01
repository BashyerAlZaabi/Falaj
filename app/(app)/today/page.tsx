import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { TodayCards } from "@/components/today/today-cards";

/** «اليوم» — الرئيسية: تحية، قراءة الوكيل، ثم بطاقات الفعل بالإلحاح. */
export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, activity, emirate, answers")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.activity || !profile?.emirate) redirect("/onboarding");

  const answers = (profile.answers ?? {}) as { stage?: string };
  const name = profile.name?.trim() || user.email?.split("@")[0] || "صديقي";

  return (
    <div>
      <PageTitle>هلا، {name}</PageTitle>
      <p className="subtle mt-1 text-sm">هذا يومك في لمحة</p>

      <section aria-label="بطاقات اليوم" className="mt-5">
        <TodayCards
          profile={{
            name: profile.name,
            activity: profile.activity,
            emirate: profile.emirate,
            stage: answers.stage,
          }}
        />
      </section>
    </div>
  );
}
