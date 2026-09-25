"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { type Locale, dirOf } from "./config";
import type { Messages } from "./messages";
import { createTranslator, type Translator } from "./translate";

type Ctx = { locale: Locale; dir: "ltr" | "rtl"; t: Translator; messages: Messages };
const I18nContext = createContext<Ctx | null>(null);

export function LocaleProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo<Ctx>(() => ({ locale, dir: dirOf(locale), t: createTranslator(messages), messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <LocaleProvider>");
  return ctx;
}

export function useT() {
  return useI18n().t;
}

export function useLocale() {
  return useI18n().locale;
}

/** Localize a bilingual record on the client: useLocalized()(course, "title") */
export function useLocalized() {
  const { locale } = useI18n();
  return <T extends Record<string, unknown>>(record: T, field: string): string => {
    const key = `${field}${locale === "ar" ? "Ar" : "En"}`;
    const fallback = `${field}${locale === "ar" ? "En" : "Ar"}`;
    const v = (record[key] as string | undefined) || (record[fallback] as string | undefined);
    return v ?? "";
  };
}
