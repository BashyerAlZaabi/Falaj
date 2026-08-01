"use client";

import { useRef } from "react";
import { normalizeFarm } from "@/lib/farm/data";
import { loadFarm, saveFarm } from "@/lib/farm/store";
import { downloadBackup } from "@/lib/agent/executor";
import { useToast } from "@/components/ui/toast";

/** نسخ احتياطي / استعادة / طباعة تقرير (المرحلة ٩). */
export function DataActions() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const btn =
    "rounded-full border border-ink-24 px-4 py-2 text-xs font-semibold text-ink-70 transition-colors duration-200 ease-e hover:bg-sand-l";

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2 border-t border-ink-24/60 pt-4">
      <button
        type="button"
        className={btn}
        onClick={async () => {
          downloadBackup(await loadFarm());
          toast({ message: "نزلت النسخة الاحتياطية" });
        }}
      >
        نسخة احتياطية
      </button>

      <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
        استعادة من ملف
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        aria-label="ملف النسخة الاحتياطية"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const parsed = normalizeFarm(JSON.parse(await file.text()));
            const before = await loadFarm();
            await saveFarm(parsed);
            toast({
              message: "استُعيدت البيانات من الملف",
              undoLabel: "تراجع",
              onUndo: () => void saveFarm(before),
            });
            setTimeout(() => window.location.reload(), 7200);
          } catch {
            toast({ message: "ملف غير صالح — تأكد أنه نسخة من التطبيق" });
          }
          e.target.value = "";
        }}
      />

      <button type="button" className={btn} onClick={() => window.print()}>
        طباعة تقرير
      </button>
    </div>
  );
}
