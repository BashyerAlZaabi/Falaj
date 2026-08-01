"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVITIES } from "@/lib/domain/activities";
import { EMIRATES, STAGES } from "@/lib/domain/emirates";
import { saveProfile } from "@/lib/profile";
import { callAgent, localToolUses, textOf, type WireMessage } from "@/lib/agent/client";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * الاستقبال المحادثي (PROMPT §7): سؤال واحد كل رسالة، يستنتج من كلام
 * المستخدم، ويحفظ عبر set_profile أول ما يعرف الثلاثة.
 * زر «أفضّل أختار يدوياً» احتياطي إلزامي عند انقطاع الشبكة.
 */

const SYSTEM = `أنت مستقبِل ودود في برنامج سفراء الزراعة الشبابية بالإمارات.
هدفك تعرف ثلاثة أشياء فقط: نشاط المستخدم الزراعي، وإمارته، ومرحلة مشروعه (فكرة / تأسيس / تشغيل).
اسأل سؤالاً واحداً فقط في كل رسالة، بعربية بلهجة إماراتية بسيطة ومختصرة.
استنتج من كلامه — لا تستجوبه: لو قال «عندي بيوت محمية في العين» فهمت النشاط (زراعة محمية) والإمارة (أبوظبي).
الأنشطة المتاحة: ${ACTIVITIES.map((a) => a.name).join("، ")}.
الإمارات: ${EMIRATES.join("، ")}.
أول ما تعرف الثلاثة استدعِ set_profile فوراً بدون سؤال إضافي.`;

type UiMsg = { role: "user" | "assistant"; text: string };

export default function OnboardingPage() {
  const router = useRouter();
  const [manual, setManual] = useState(false);
  const [ui, setUi] = useState<UiMsg[]>([
    { role: "assistant", text: "هلا فيك في سفراء الزراعة 🌾 خبرني عن مشروعك — وش تزرع أو تشتغل، وفي أي إمارة؟" },
  ]);
  const [wire, setWire] = useState<WireMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // الاحتياطي اليدوي
  const [activity, setActivity] = useState("");
  const [emirate, setEmirate] = useState("");
  const [stage, setStage] = useState("");
  const [saving, setSaving] = useState(false);

  async function finish(a: string, e: string, s: string) {
    const ok = await saveProfile({ activity: a, emirate: e, stage: s });
    if (!ok) {
      setError("تعذّر الحفظ — حاول مرة ثانية");
      return;
    }
    router.push("/today");
    router.refresh();
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    setUi((l) => [...l, { role: "user", text }]);

    let messages: WireMessage[] = [...wire, { role: "user", content: text }];
    try {
      const reply = await callAgent(messages, SYSTEM, "onboarding");
      if (reply.error) {
        setError(`${reply.error} — تقدر تكمل بالاختيار اليدوي تحت`);
        setManual(true);
        return;
      }

      const answer = textOf(reply.content);
      if (answer) setUi((l) => [...l, { role: "assistant", text: answer }]);

      const tool = localToolUses(reply.content).find((t) => t.name === "set_profile");
      messages = [...messages, { role: "assistant", content: reply.content }];

      if (tool) {
        const inp = tool.input ?? {};
        setUi((l) => [...l, { role: "assistant", text: "تم! جهّزت لك كل شي ✅" }]);
        await finish(String(inp.activity ?? ""), String(inp.emirate ?? ""), String(inp.stage ?? ""));
        return;
      }
      setWire(messages);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <header className="mb-4 text-center">
        <p className="mb-1 text-xs font-medium text-ink-45">برنامج سفراء الزراعة الشبابية</p>
        <h1 className="display text-2xl">نتعرّف عليك</h1>
      </header>

      {!manual && (
        <>
          <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto pb-4">
            {ui.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "rounded-bl-sm bg-falaj font-medium text-ink"
                      : "rounded-br-sm bg-white text-ink shadow-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-end">
                <div className="w-2/3 space-y-2 rounded-lg bg-white p-4 shadow-sm">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            )}
            {error && <p className="text-center text-xs font-medium text-rust">{error}</p>}
          </div>

          <div className="flex gap-2 border-t border-ink-24/60 pt-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="اكتب هنا…"
              aria-label="ردك"
              dir="auto"
              className="flex-1 rounded-full border border-ink-24 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-falaj focus:ring-2 focus:ring-falaj/20"
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-full bg-falaj px-5 py-2.5 text-sm font-semibold text-ink transition-colors duration-200 ease-e hover:bg-falaj-d disabled:opacity-50"
            >
              إرسال
            </button>
          </div>

          <button
            type="button"
            onClick={() => setManual(true)}
            className="mt-3 text-center text-sm font-medium text-ink-45 underline underline-offset-4 hover:text-ink-70"
          >
            أفضّل أختار يدوياً
          </button>
        </>
      )}

      {manual && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm">وش نشاطك؟</h2>
            <div className="flex flex-wrap gap-2">
              {ACTIVITIES.map((a) => (
                <Chip
                  key={a.name}
                  label={`${a.icon} ${a.name}`}
                  pressed={activity === a.name}
                  onClick={() => setActivity(a.name)}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm">في أي إمارة؟</h2>
            {/* مخطط متدرّج يحاكي امتداد الساحل: الحاوية LTR والأبناء RTL (PROMPT §9) */}
            <div dir="ltr" className="flex flex-wrap gap-2">
              {EMIRATES.map((e, i) => (
                <span key={e} dir="rtl" style={{ marginTop: `${(i % 4) * 4}px` }}>
                  <Chip label={e} pressed={emirate === e} onClick={() => setEmirate(e)} />
                </span>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm">وين وصل مشروعك؟</h2>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <Chip key={s} label={s} pressed={stage === s} onClick={() => setStage(s)} />
              ))}
            </div>
          </section>

          <div aria-live="polite">
            {error && <p className="text-sm font-medium text-rust">{error}</p>}
          </div>

          <button
            type="button"
            disabled={!activity || !emirate || !stage || saving}
            onClick={async () => {
              setSaving(true);
              await finish(activity, emirate, stage);
              setSaving(false);
            }}
            className="w-full rounded-full bg-falaj py-3.5 text-base font-semibold text-ink transition-all duration-200 ease-e hover:bg-falaj-d disabled:opacity-50"
          >
            {saving ? "لحظة…" : "ابدأ"}
          </button>

          <button
            type="button"
            onClick={() => setManual(false)}
            className="w-full text-center text-sm font-medium text-ink-45 underline underline-offset-4"
          >
            رجوع للمحادثة
          </button>
        </div>
      )}
    </main>
  );
}
