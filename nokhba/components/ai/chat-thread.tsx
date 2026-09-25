"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { ChatTurn } from "@/hooks/use-ai-chat";

/** Renders a list of chat turns with streaming, markdown and error states. Shared by tutor, companion and code help. */
export function ChatThread({ turns, className, emptyState }: { turns: ChatTurn[]; className?: string; emptyState?: React.ReactNode }) {
  const t = useT();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [turns]);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {turns.length === 0 && emptyState}
      {turns.map((turn) => (
        <div key={turn.id} className={cn("flex gap-2.5", turn.role === "user" ? "flex-row-reverse" : "")}>
          {turn.role === "assistant" && <span className="ai-orb mt-1 grid size-6 shrink-0 place-items-center rounded-full text-white"><Sparkles className="size-3" /></span>}
          <div dir="auto" className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", turn.role === "user" ? "bg-primary text-primary-foreground rounded-ee-md" : "glass-2 rounded-es-md", turn.error && "border-destructive/40 text-destructive")}>
            {turn.role === "user" ? (
              <p className="whitespace-pre-wrap">{turn.content}</p>
            ) : turn.error ? (
              <p>{turn.error}</p>
            ) : turn.pending && !turn.content ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="flex gap-1" aria-hidden><i className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" /><i className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms]" /><i className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms]" /></span>
                {t("common.ai.thinking")}
              </span>
            ) : (
              <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:my-2 prose-pre:my-2 prose-pre:rounded-xl prose-pre:bg-background/70 prose-code:before:content-none prose-code:after:content-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}
