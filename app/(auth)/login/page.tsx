"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setNotice(null);

    if (!email || !password) {
      setError("أدخل البريد وكلمة المرور");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("كلمة المرور ٦ أحرف على الأقل");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() } },
        });
        if (err) {
          setError(translateError(err.message));
          return;
        }
        if (!data.session) {
          setNotice("أرسلنا رابط تأكيد إلى بريدك. فعّل حسابك ثم سجّل الدخول.");
          setMode("signin");
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) {
          setError(translateError(err.message));
          return;
        }
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("تعذّر الاتصال. تحقّق من الشبكة وحاول مجدداً.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !busy) submit();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-nacre px-6 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-9 text-center">
          <p className="mb-2 text-xs font-medium text-ink-45">
            برنامج سفراء الزراعة الشبابية
          </p>
          <h1 className="display text-4xl text-ink">الأمن الغذائي</h1>
          <p className="subtle mt-2 text-[15px]">
            {mode === "signin" ? "سجّل دخولك للمتابعة" : "أنشئ حسابك للبدء"}
          </p>
        </header>

        {/* مبدّل مقطعي بأسلوب آبل — الحالة عبر aria-pressed */}
        <div
          className="mb-6 flex rounded-md bg-black/5 p-0.5"
          role="group"
          aria-label="اختيار الدخول أو التسجيل"
        >
          <button
            type="button"
            aria-pressed={mode === "signin"}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className="flex-1 rounded-sm py-2 text-sm font-medium text-ink-45 transition-colors duration-200 ease-e aria-pressed:bg-white aria-pressed:text-ink aria-pressed:shadow-sm"
          >
            دخول
          </button>
          <button
            type="button"
            aria-pressed={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className="flex-1 rounded-sm py-2 text-sm font-medium text-ink-45 transition-colors duration-200 ease-e aria-pressed:bg-white aria-pressed:text-ink aria-pressed:shadow-sm"
          >
            حساب جديد
          </button>
        </div>

        <div className="space-y-3">
          {mode === "signup" && (
            <Field
              label="الاسم"
              value={name}
              onChange={setName}
              onKeyDown={onKeyDown}
              autoComplete="name"
              inputMode="text"
            />
          )}
          <Field
            label="البريد الإلكتروني"
            value={email}
            onChange={setEmail}
            onKeyDown={onKeyDown}
            type="email"
            autoComplete="email"
            inputMode="email"
          />
          <Field
            label="كلمة المرور"
            value={password}
            onChange={setPassword}
            onKeyDown={onKeyDown}
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>

        <div aria-live="polite" className="min-h-[1.25rem]">
          {error && (
            <p className="mt-3 text-sm font-medium text-rust">{error}</p>
          )}
          {notice && <p className="mt-3 text-sm text-falaj-d">{notice}</p>}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-4 w-full rounded-full bg-falaj py-3.5 text-base font-medium text-white transition-all duration-200 ease-e hover:bg-falaj-d active:scale-[.98] disabled:opacity-60"
        >
          {busy
            ? "لحظة…"
            : mode === "signin"
              ? "تسجيل الدخول"
              : "إنشاء الحساب"}
        </button>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  onKeyDown,
  type = "text",
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "email";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-45">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete={autoComplete}
        inputMode={inputMode}
        dir="auto"
        className="w-full rounded-md border border-ink-24 bg-white px-3.5 py-3 text-ink outline-none transition-colors duration-200 ease-e placeholder:text-ink-24 focus:border-falaj focus:ring-2 focus:ring-falaj/20"
      />
    </label>
  );
}

function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "البريد أو كلمة المرور غير صحيحة";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "هذا البريد مسجّل مسبقاً — سجّل الدخول";
  if (m.includes("email not confirmed")) return "فعّل حسابك من رابط البريد أولاً";
  if (m.includes("rate limit")) return "محاولات كثيرة — انتظر قليلاً";
  return message;
}
