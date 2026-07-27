import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/logout-button";

/**
 * صفحة رئيسية محميّة (مؤقتة للمرحلة ١) — تُثبت أن الجلسة تعمل
 * وأن صف profiles كُتب للمستخدم عبر الـ trigger.
 * تُستبدل بـ «اليوم» في المرحلة ٤.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // شبكة أمان — الـ middleware يحمي أصلاً، لكن نتحقّق هنا أيضاً.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, activity, emirate, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const name = profile?.name?.trim() || user.email?.split("@")[0] || "صديقي";

  return (
    <main className="mx-auto min-h-dvh max-w-md px-6 py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="font-head text-xs text-brass">
            برنامج سفراء الزراعة الشبابية
          </p>
          <h1 className="mt-1 font-head text-2xl text-ink">
            هلا، {name} 👋
          </h1>
        </div>
        <LogoutButton />
      </header>

      <section className="rounded-lg border border-ink-24 bg-paper p-5">
        <h2 className="mb-3 font-head text-sm text-ink-70">ملفّك</h2>
        <dl className="space-y-2 text-sm">
          <Row label="البريد" value={user.email ?? "—"} />
          <Row label="النشاط" value={profile?.activity ?? "لم يُحدَّد بعد"} />
          <Row label="الإمارة" value={profile?.emirate ?? "لم تُحدَّد بعد"} />
          <Row label="الدور" value={profile?.role ?? "—"} />
        </dl>
      </section>

      <p className="subtle mt-6 text-center text-xs">
        المرحلة ١ · المصادقة تعمل — الاستقبال و«اليوم» في مراحل قادمة
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-45">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
