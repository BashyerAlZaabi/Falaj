"use client";

import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary:
    "rounded-full bg-falaj font-semibold text-ink hover:bg-falaj-d disabled:opacity-60 border border-transparent",
  ghost:
    "bg-transparent text-ink-70 border border-ink-24 hover:bg-nacre-2 disabled:opacity-50",
  danger:
    "bg-transparent text-rust border border-rust/40 hover:bg-rust/5 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-md px-4 py-2.5 text-sm font-medium transition-colors duration-200 ease-e active:scale-[.98] ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
