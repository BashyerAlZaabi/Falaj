export { cn } from "cn";

/** Initials for avatars: "Sara Al Mansoori" → "SA" */
export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/** Stable gradient class for course covers keyed by a string (no images needed). */
export const COVER_GRADIENTS = ["cover-aurora", "cover-dusk", "cover-mint", "cover-ember", "cover-slate", "cover-orchid", "cover-ocean", "cover-sand"] as const;
export function coverGradient(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}

export function greetingKey(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? "common.greeting.morning" : h < 18 ? "common.greeting.afternoon" : "common.greeting.evening";
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
