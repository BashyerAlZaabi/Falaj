"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildSystemContext, type ProfileContext } from "@/lib/agent/context";
import {
  callAgent,
  localToolUses,
  textOf,
  MAX_TOOL_ROUNDS,
  type ContentBlock,
  type WireMessage,
} from "@/lib/agent/client";
import { downloadBackup, executeTool } from "@/lib/agent/executor";
import { loadFarm, saveFarm } from "@/lib/farm/store";
import { emptyFarm, type FarmData } from "@/lib/farm/data";
import { Skeleton } from "@/components/ui/skeleton";

/** رسالة معروضة في الواجهة. النصوص تمر عبر React فتُهرَّب تلقائياً (esc). */
type UiMessage =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; ok: boolean; text: string }
  | { kind: "error"; text: string };

export function Chat() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileContext>({});
  const [farm, setFarm] = useState<FarmData>(emptyFarm());
  const [ui, setUi] = useState<UiMessage[]>([]);
  const [wire, setWire] = useState<WireMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("name, activity, emirate, answers")
          .eq("id", user.id)
          .maybeSingle();
        const answers = (data?.answers ?? {}) as { stage?: string };
        setProfile({
          name: data?.name,
          activity: data?.activity,
          emirate: data?.emirate,
          stage: answers.stage,
        });
      }
      setFarm(await loadFarm());
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [ui, busy]);

  function push(m: UiMessage) {
    setUi((list) => [...list, m]);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    push({ kind: "user", text });

    // نسخة عمل محلية تتحوّر بالأدوات ثم تُحفظ
    const working: FarmData = JSON.parse(JSON.stringify(farm));
    let messages: WireMessage[] = [...wire, { role: "user", content: text }];
    let navigateTo: string | null = null;
    let mutated = false;

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        // السياق يُبنى في كل رسالة من الحالة الحية
        const system = buildSystemContext(profile, working);
        const reply = await callAgent(messages, system);

        if (reply.error) {
          push({ kind: "error", text: reply.error });
          break;
        }

        const answer = textOf(reply.content);
        if (answer) push({ kind: "assistant", text: answer });

        const toolUses = localToolUses(reply.content);
        if (reply.stop_reason !== "tool_use" || toolUses.length === 0) {
          messages = [...messages, { role: "assistant", content: reply.content }];
          break;
        }

        // نفّذ كل أداة محلياً واعرض كل تنفيذ كسطر منفصل
        const results: ContentBlock[] = [];
        for (const t of toolUses) {
          const outcome = executeTool(t.name!, t.input ?? {}, working);
          push({ kind: "tool", ok: outcome.ok, text: outcome.message });
          if (outcome.mutated) mutated = true;
          if (outcome.download) downloadBackup(working);
          if (outcome.print) setTimeout(() => window.print(), 300);
          if (outcome.navigate) navigateTo = outcome.navigate;
          results.push({
            type: "tool_result",
            tool_use_id: t.id,
            content: outcome.message,
            is_error: !outcome.ok,
          });
        }

        messages = [
          ...messages,
          { role: "assistant", content: reply.content },
          { role: "user", content: results },
        ];
      }
    } finally {
      if (mutated) {
        setFarm(working);
        const saved = await saveFarm(working);
        if (!saved)
          push({ kind: "error", text: "تنبيه: تعذّر حفظ التغييرات في السحابة" });
      }
      setWire(messages);
      setBusy(false);
      if (navigateTo) router.push(navigateTo);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] flex-col">
      <div
        aria-live="polite"
        aria-label="المحادثة"
        className="flex-1 space-y-3 overflow-y-auto pb-4"
      >
        {ui.length === 0 && !busy && (
          <div className="rounded-lg bg-nacre-2 p-4 text-sm text-ink-45">
            <p className="font-medium text-ink-70">أمثلة تقدر تطلبها:</p>
            <ul className="mt-2 space-y-1">
              <li>«أضف قطعة ٥٠٠ متر وحط عليها دورة خيار»</li>
              <li>«سجّل بيع طماطم بـ ٢٥٠ درهم»</li>
              <li>«شو المهام المتأخرة عندي؟»</li>
            </ul>
          </div>
        )}

        {ui.map((m, i) => {
          if (m.kind === "user")
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-falaj px-4 py-2.5 text-sm text-white">
                  {m.text}
                </div>
              </div>
            );
          if (m.kind === "assistant")
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-white px-4 py-2.5 text-sm text-ink shadow-sm">
                  {m.text}
                </div>
              </div>
            );
          if (m.kind === "tool")
            return (
              <div key={i} className="flex justify-end">
                <p
                  className={`text-xs font-medium ${m.ok ? "text-falaj-d" : "text-rust"}`}
                >
                  {m.text}
                </p>
              </div>
            );
          return (
            <p key={i} className="text-center text-xs font-medium text-rust">
              {m.text}
            </p>
          );
        })}

        {busy && (
          <div className="flex justify-end">
            <div className="w-2/3 space-y-2 rounded-lg bg-white p-4 shadow-sm">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 border-t border-ink-24/60 pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) send();
          }}
          placeholder="اكتب طلبك…"
          aria-label="رسالتك للمساعد"
          dir="auto"
          className="flex-1 rounded-full border border-ink-24 bg-white px-4 py-2.5 text-sm text-ink outline-none transition-colors duration-200 ease-e placeholder:text-ink-24 focus:border-falaj focus:ring-2 focus:ring-falaj/20"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-full bg-falaj px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 ease-e hover:bg-falaj-d disabled:opacity-50"
        >
          إرسال
        </button>
      </div>
    </div>
  );
}
