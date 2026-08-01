type Tone = "neutral" | "good" | "warn" | "bad";

const tones: Record<Tone, string> = {
  neutral: "bg-nacre-2 text-ink-70 border-ink-24",
  good: "bg-sand-l text-falaj-d border-transparent",
  warn: "bg-sand text-abyss border-transparent",
  bad: "bg-rust/10 text-rust border-transparent",
};

export function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2.5 py-0.5 font-head text-xs ${tones[tone]}`}
    >
      {label}
    </span>
  );
}
