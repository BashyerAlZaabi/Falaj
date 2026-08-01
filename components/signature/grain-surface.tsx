import { type HTMLAttributes } from "react";

/**
 * السطح الداكن المُحبَّب — الطبقة المادية للهوية (PROMPT §3):
 * grain (feTurbulence) بشفافية .06 وblend overlay + تدرّج شعاعي من الزاوية العليا.
 * التنفيذ في .surface-dark داخل globals.css؛ هذا المكوّن غلافه الدلالي.
 */
export function GrainSurface({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`surface-dark ${className}`} {...props} />;
}
