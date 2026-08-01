import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { FalajStream } from "@/components/signature/falaj-stream";

/**
 * «اليوم» — الصفحة الرئيسية. في المرحلة ٤ تكتمل:
 * قراءة الوكيل ثم بطاقات الفعل مرتبة بالإلحاح (PROMPT §6).
 */
export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = "صديقي";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    name = profile?.name?.trim() || user.email?.split("@")[0] || name;
  }

  return (
    <div>
      <PageTitle>هلا، {name}</PageTitle>
      <p className="subtle mt-1 text-sm">هذا يومك في لمحة</p>

      <FalajStream className="my-5" />

      <section aria-label="بطاقات اليوم" className="space-y-3">
        <EmptyState
          title="ما في شي عالق"
          hint="بطاقات المهام والتراخيص والمخزون تظهر هنا أول ما تكتمل بيانات مزرعتك"
        />
      </section>
    </div>
  );
}
