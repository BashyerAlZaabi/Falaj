"use client";

import { Sparkles, RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { useAiChat } from "@/hooks/use-ai-chat";
import { ChatThread } from "./chat-thread";
import { ChatComposer } from "./chat-composer";

/** Global AI Study Companion — opened from the floating orb, ⌘J, or the mobile bar. */
export function CompanionPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, dir, locale } = useI18n();
  const chat = useAiChat({ kind: "companion" });
  const chips = locale === "ar"
    ? [{ label: "ماذا أدرس اليوم؟", prompt: "ماذا يجب أن أدرس اليوم؟" }, { label: "كيف أدائي؟", prompt: "كيف أدائي في التعلّم حتى الآن؟" }, { label: "ما المهارات الناقصة؟", prompt: "ما المهارات التي أفتقدها؟" }, { label: "خطة دراسة", prompt: "ابنِ لي خطة دراسة لهذا الأسبوع." }, { label: "جهّزني للاختبار", prompt: "جهّزني للاختبار القادم." }, { label: "رشّح دورة", prompt: "رشّح لي الدورة التالية." }]
    : [{ label: "What should I study today?", prompt: "What should I study today?" }, { label: "How am I doing?", prompt: "How am I doing so far?" }, { label: "What skills am I missing?", prompt: "What skills am I missing?" }, { label: "Build a study plan", prompt: "Build me a study plan for this week." }, { label: "Prepare me for my exam", prompt: "Prepare me for my next exam." }, { label: "Recommend a course", prompt: "Recommend my next course." }];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={dir === "rtl" ? "left" : "right"} className="glass-3 flex w-full flex-col gap-0 border-glass-border p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center gap-3 border-b border-glass-border px-4 py-3 text-start">
          <span className="ai-orb ai-orb-glow grid size-9 place-items-center rounded-full text-white"><Sparkles className="size-4" /></span>
          <div className="flex-1">
            <SheetTitle className="text-base">{t("common.ai.companion")}</SheetTitle>
            <SheetDescription className="text-xs">{t("common.ai.disclaimer")}</SheetDescription>
          </div>
          {chat.turns.length > 0 && <Button variant="ghost" size="icon-sm" onClick={chat.reset} aria-label={t("common.ai.newChat")}><RotateCcw className="size-3.5" /></Button>}
        </SheetHeader>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
          <ChatThread
            turns={chat.turns}
            emptyState={
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                <span className="ai-orb grid size-14 place-items-center rounded-full text-white"><Sparkles className="size-6" /></span>
                <p className="font-heading text-lg font-semibold">{t("common.ai.companion")}</p>
                <p className="max-w-xs text-sm text-muted-foreground">{t("common.ai.companionPlaceholder")}</p>
              </div>
            }
          />
        </div>
        <div className="border-t border-glass-border p-3">
          <ChatComposer onSend={chat.send} onStop={chat.stop} busy={chat.busy} placeholder={t("common.ai.companionPlaceholder")} chips={chips} autoFocus />
        </div>
      </SheetContent>
    </Sheet>
  );
}
