"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await createClient().auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="rounded-sm border border-ink-24 px-4 py-2 font-head text-sm text-ink-70 transition-colors duration-200 ease-e hover:bg-nacre-2 disabled:opacity-60"
    >
      {busy ? "…" : "تسجيل الخروج"}
    </button>
  );
}
