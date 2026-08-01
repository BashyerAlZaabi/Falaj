/** رقم بارز مع تسمية — الأرقام لاتينية جدولية عبر tabular-nums على body. */
export function Stat({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md bg-nacre-2 px-4 py-3">
      <p className="font-head text-xs text-ink-45">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-ink" dir="ltr">
        {value}
        {unit && <span className="ms-1 text-sm font-normal text-ink-45">{unit}</span>}
      </p>
      {hint && <p className="subtle mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}
