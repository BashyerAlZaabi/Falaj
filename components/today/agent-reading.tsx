"use client";

import { useEffect, useRef, useState } from "react";
import { buildSystemContext, type ProfileContext } from "@/lib/agent/context";
import { callAgent, textOf } from "@/lib/agent/client";
import { type FarmData } from "@/lib/farm/data";
import { Skeleton } from "@/components/ui/skeleton";

/** قراءة الوكيل أعلى «اليوم» — سطرين من الحالة الحية. تختفي بصمت لو الخدمة غير مهيأة. */
export function AgentReading({
  profile,
  farm,
}: {
  profile: ProfileContext;
  farm: FarmData;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    (async () => {
      const system = buildSystemContext(profile, farm);
      const reply = await callAgent(
        [
          {
            role: "user",
            content:
              "أعطني قراءة سريعة ليومي في سطرين كحد أقصى: الأهم أولاً، بلا أدوات وبلا مقدمات.",
          },
        ],
        system,
      );
      setLoading(false);
      if (!reply.error) {
        const t = textOf(reply.content);
        if (t) setText(t);
      }
    })();
  }, [profile, farm]);

  if (loading)
    return (
      <div className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  if (!text) return null;

  return (
    <div className="rounded-lg border-s-4 border-falaj bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-ink-45">قراءة اليوم</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{text}</p>
    </div>
  );
}
