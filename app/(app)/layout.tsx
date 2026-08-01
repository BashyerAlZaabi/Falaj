import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeBadges } from "@/lib/badges";
import { MainNav } from "@/components/nav/main-nav";
import { ToastProvider } from "@/components/ui/toast";
import { LogoutButton } from "@/components/auth/logout-button";

/** قشرة التطبيق: الشريط العلوي + التنقل الرباعي (PROMPT §5). */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const badges = await computeBadges(supabase, user.id);

  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh max-w-md">
        <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
          <p className="font-head text-xs text-ink-45">
            سفراء الزراعة الشبابية
          </p>
          <LogoutButton />
        </header>

        <main className="px-5 pb-28 pt-2">{children}</main>
      </div>
      <MainNav badges={badges} />
    </ToastProvider>
  );
}
