/** شارة حمراء بعدد البنود المتأخرة (PROMPT §6). */
export function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${label}: ${count} بند متأخر`}
      className="inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-rust px-1 text-[0.65rem] font-semibold leading-none text-paper"
      dir="ltr"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
