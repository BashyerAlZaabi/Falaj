"use client";

/** شريحة اختيار — الحالة عبر aria-pressed لا inline style (PROMPT §11). */
export function Chip({
  label,
  pressed,
  onClick,
  disabled,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className="rounded-sm border border-ink-24 px-3.5 py-1.5 font-head text-sm text-ink-70 transition-colors duration-200 ease-e aria-pressed:border-falaj aria-pressed:bg-sand-l aria-pressed:text-ink disabled:opacity-50"
    >
      {label}
    </button>
  );
}
