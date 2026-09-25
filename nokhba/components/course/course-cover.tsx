import { cn } from "@/lib/utils";

/** Generated cover art: a named gradient token + a soft geometric mark. No image assets needed. */
const GRADIENTS: Record<string, string> = {
  "cover-aurora": "from-sky-400/80 via-indigo-400/70 to-fuchsia-400/70",
  "cover-dusk": "from-indigo-500/80 via-violet-500/70 to-rose-400/70",
  "cover-mint": "from-emerald-400/80 via-teal-400/70 to-cyan-400/70",
  "cover-ember": "from-orange-400/80 via-rose-400/70 to-pink-500/70",
  "cover-slate": "from-slate-500/80 via-slate-400/70 to-zinc-300/70",
  "cover-orchid": "from-fuchsia-400/80 via-purple-400/70 to-indigo-400/70",
  "cover-ocean": "from-cyan-400/80 via-sky-500/70 to-blue-600/70",
  "cover-sand": "from-amber-300/80 via-orange-300/70 to-yellow-200/70",
};

export function CourseCover({ token, className, children }: { token?: string | null; className?: string; children?: React.ReactNode }) {
  const g = GRADIENTS[token ?? ""] ?? GRADIENTS["cover-aurora"];
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br", g, className)} aria-hidden>
      <div className="absolute -end-8 -top-8 size-40 rounded-full bg-white/25 blur-2xl" />
      <div className="absolute -bottom-10 start-6 size-32 rounded-full bg-black/10 blur-2xl" />
      <svg className="absolute end-4 top-4 size-10 text-white/60" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 4.6L19 4.9l-1.7 4.8L22 12l-4.7 2.3L19 19.1l-4.8-1.7L12 22l-2.2-4.6L5 19.1l1.7-4.8L2 12l4.7-2.3L5 4.9l4.8 1.7z" /></svg>
      {children}
    </div>
  );
}
