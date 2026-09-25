"use client";

import { useState } from "react";
import { SendHorizontal, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function ChatComposer({ onSend, onStop, busy, placeholder, chips, className, autoFocus }: { onSend: (text: string) => void; onStop?: () => void; busy: boolean; placeholder: string; chips?: Array<{ label: string; prompt: string }>; className?: string; autoFocus?: boolean }) {
  const { t, dir } = useI18n();
  const [value, setValue] = useState("");
  const submit = () => { if (!value.trim() || busy) return; onSend(value); setValue(""); };
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {chips && chips.length > 0 && (
        <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1">
          {chips.map((c) => (
            <button key={c.label} type="button" disabled={busy} onClick={() => onSend(c.prompt)} className="shrink-0 rounded-full border border-glass-border bg-background/50 px-3 py-1 text-xs font-medium text-foreground/80 transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50">
              {c.label}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="glass-2 flex items-end gap-2 rounded-2xl p-1.5 ps-3">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          rows={1}
          dir="auto"
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        {busy && onStop ? (
          <Button type="button" size="icon" variant="secondary" onClick={onStop} aria-label={t("common.ai.stop")}><Square className="size-3.5" /></Button>
        ) : (
          <Button type="submit" size="icon" disabled={!value.trim() || busy} aria-label={t("common.ai.send")}><SendHorizontal className={cn("size-4", dir === "rtl" && "-scale-x-100")} /></Button>
        )}
      </form>
    </div>
  );
}
