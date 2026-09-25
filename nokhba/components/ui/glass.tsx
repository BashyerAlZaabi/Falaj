import * as React from "react";
import { cn } from "@/lib/utils";

type Level = 1 | 2 | 3 | 4;

/**
 * Glass surface. Levels map to the design system:
 *  1 navigation surfaces · 2 cards/modules · 3 modals & floating AI · 4 focused learning environment
 */
export function Glass({ level = 2, interactive, edge = true, className, asChild, ...props }: React.ComponentProps<"div"> & { level?: Level; interactive?: boolean; edge?: boolean; asChild?: boolean }) {
  return <div data-slot="glass" className={cn(`glass-${level}`, "rounded-2xl", edge && "glass-edge", interactive && "glass-interactive", className)} {...props} />;
}

export function GlassCard({ className, ...props }: React.ComponentProps<typeof Glass>) {
  return <Glass level={2} className={cn("p-5 sm:p-6", className)} {...props} />;
}

/** Small uppercase label used above sections. */
export function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", className)} {...props} />;
}

export function SectionTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("font-heading text-xl font-semibold tracking-tight sm:text-2xl", className)} {...props} />;
}

export function Stat({ label, value, hint, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="tnum font-heading text-2xl font-semibold tracking-tight">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
