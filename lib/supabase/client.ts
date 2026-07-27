import { createBrowserClient } from "@supabase/ssr";

/**
 * عميل Supabase لمكوّنات العميل (المتصفح).
 * المفتاح المستخدم هو anon العام — الحماية الفعلية عبر RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
