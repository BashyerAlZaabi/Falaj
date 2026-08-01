"use client";

import { useCallback, useEffect, useState } from "react";
import { emptyFarm, type FarmData } from "@/lib/farm/data";
import { loadFarm, saveFarm } from "@/lib/farm/store";
import { useToast } from "@/components/ui/toast";

/**
 * هوك مشترك لأقسام «مزرعتي»: تحميل، تعديل مع حفظ، وحذف قابل للتراجع
 * ٧ ثوانٍ عبر Toast (PROMPT §11) — التراجع يرجّع لقطة كاملة، فحذف قطعة
 * يرجع هو ودوراتها معاً.
 */
export function useFarm() {
  const toast = useToast();
  const [farm, setFarm] = useState<FarmData>(emptyFarm());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFarm().then((f) => {
      setFarm(f);
      setLoading(false);
    });
  }, []);

  const apply = useCallback(async (next: FarmData) => {
    setFarm(next);
    await saveFarm(next);
  }, []);

  /** تعديل عادي (إضافة/تحديث). */
  const mutate = useCallback(
    async (fn: (draft: FarmData) => void) => {
      const draft: FarmData = JSON.parse(JSON.stringify(farm));
      fn(draft);
      await apply(draft);
    },
    [farm, apply],
  );

  /** حذف قابل للتراجع: toast فيه زر «تراجع» يرجّع اللقطة السابقة. */
  const destructive = useCallback(
    async (message: string, fn: (draft: FarmData) => void) => {
      const snapshot: FarmData = JSON.parse(JSON.stringify(farm));
      const draft: FarmData = JSON.parse(JSON.stringify(farm));
      fn(draft);
      await apply(draft);
      toast({
        message,
        undoLabel: "تراجع",
        onUndo: () => {
          void apply(snapshot);
        },
      });
    },
    [farm, apply, toast],
  );

  return { farm, loading, mutate, destructive };
}
