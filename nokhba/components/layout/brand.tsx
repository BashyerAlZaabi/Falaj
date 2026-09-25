import Link from "next/link";
import { cn } from "@/lib/utils";

/** Nokhba wordmark: an eight-point mark (a nod to Islamic geometry) beside the name. */
export function BrandMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-grid place-items-center rounded-xl bg-foreground text-background", className)} style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.2 4.6L19 4.9l-1.7 4.8L22 12l-4.7 2.3L19 19.1l-4.8-1.7L12 22l-2.2-4.6L5 19.1l1.7-4.8L2 12l4.7-2.3L5 4.9l4.8 1.7z" />
      </svg>
    </span>
  );
}

export function Brand({ href = "/", className, showName = true, nameAr }: { href?: string; className?: string; showName?: boolean; nameAr?: boolean }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 font-heading text-lg font-semibold tracking-tight", className)} aria-label="Nokhba">
      <BrandMark />
      {showName ? <span>{nameAr ? "نخبة" : "Nokhba"}</span> : null}
    </Link>
  );
}
