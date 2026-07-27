import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * عميل Supabase لمكوّنات ووظائف الخادم (Route Handlers، Server Components).
 * يقرأ ويكتب جلسة المستخدم من الكوكيز.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // يُستدعى من Server Component — تُتجاهَل الكتابة، والـ middleware يحدّث الجلسة.
          }
        },
      },
    },
  );
}
