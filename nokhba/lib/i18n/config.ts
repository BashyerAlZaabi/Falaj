export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "nokhba_locale";

export const localeMeta: Record<Locale, { dir: "ltr" | "rtl"; nativeName: string; htmlLang: string }> = {
  en: { dir: "ltr", nativeName: "English", htmlLang: "en" },
  ar: { dir: "rtl", nativeName: "العربية", htmlLang: "ar" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function dirOf(locale: Locale) {
  return localeMeta[locale].dir;
}

/** Pick the localized member of a bilingual record: pick(course, "title", "ar") → course.titleAr */
export function pick<T extends Record<string, unknown>>(record: T, field: string, locale: Locale): string {
  const key = `${field}${locale === "ar" ? "Ar" : "En"}` as keyof T;
  const fallback = `${field}${locale === "ar" ? "En" : "Ar"}` as keyof T;
  const value = record[key] ?? record[fallback];
  return typeof value === "string" ? value : "";
}

/** Same for arrays: pickList(course, "outcomes", locale) */
export function pickList<T extends Record<string, unknown>>(record: T, field: string, locale: Locale): string[] {
  const key = `${field}${locale === "ar" ? "Ar" : "En"}` as keyof T;
  const fallback = `${field}${locale === "ar" ? "En" : "Ar"}` as keyof T;
  const value = (record[key] as unknown[] | undefined)?.length ? record[key] : record[fallback];
  return Array.isArray(value) ? (value as string[]) : [];
}
