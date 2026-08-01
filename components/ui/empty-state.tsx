/** حالة فاضية لكل قائمة — لا نترك فراغاً (PROMPT §11). */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-ink-24 bg-nacre-2/60 px-6 py-10 text-center">
      <span aria-hidden="true" className="mb-1 flex gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-falaj-l" />
        <span className="h-2 w-2 rounded-sm bg-brass" />
        <span className="h-2 w-2 rounded-sm bg-sand" />
      </span>
      <p className="font-head text-sm text-ink-70">{title}</p>
      {hint && <p className="subtle text-xs">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
