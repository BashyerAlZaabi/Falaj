import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { type Locale, locales } from "./config";

export type Messages = Record<string, string>;

/**
 * Message dictionaries live in messages/<locale>/<namespace>.json.
 * Every namespace file is merged into one flat dictionary keyed "namespace.key",
 * so features add their own file (e.g. messages/en/projects.json) without touching
 * a shared index. Missing Arabic keys fall back to English at lookup time.
 */
const flatten = (obj: Record<string, unknown>, prefix = ""): Messages => {
  const out: Messages = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else if (typeof v === "string") out[key] = v;
  }
  return out;
};

const loadLocale = (locale: Locale): Messages => {
  const dir = path.join(process.cwd(), "messages", locale);
  if (!fs.existsSync(dir)) return {};
  const out: Messages = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const ns = file.replace(/\.json$/, "");
    try {
      const json = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
      Object.assign(out, flatten(json, ns));
    } catch (e) {
      console.error(`[i18n] invalid JSON in messages/${locale}/${file}:`, (e as Error).message);
    }
  }
  return out;
};

// In development re-read on every request so new keys show up without a restart.
const memo = new Map<Locale, Messages>();
export const getMessages = cache((locale: Locale): Messages => {
  if (process.env.NODE_ENV === "production" && memo.has(locale)) return memo.get(locale)!;
  const base = locale === "en" ? {} : loadLocale("en");
  const merged = { ...base, ...loadLocale(locale) };
  memo.set(locale, merged);
  return merged;
});

export function getAllMessages() {
  return Object.fromEntries(locales.map((l) => [l, getMessages(l)])) as Record<Locale, Messages>;
}
