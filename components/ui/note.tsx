type Tone = "info" | "warn" | "error";

const tones: Record<Tone, string> = {
  info: "border-ink-24 text-ink-70",
  warn: "border-brass/50 text-falaj-d bg-sand-l/40",
  error: "border-rust/40 text-rust bg-rust/5",
};

export function Note({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-md border border-dashed px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
