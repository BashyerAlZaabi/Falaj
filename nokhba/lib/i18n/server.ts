import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, defaultLocale, isLocale, type Locale, dirOf } from "./config";
import { getMessages } from "./messages";
import { createTranslator } from "./translate";

/** Locale resolution: cookie → Accept-Language → default. (Signed-in users' saved locale is synced to the cookie on sign-in.) */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  if (/^ar\b|,ar\b/i.test(accept)) return "ar";
  return defaultLocale;
});

export async function getT() {
  const locale = await getLocale();
  return createTranslator(getMessages(locale));
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, dir: dirOf(locale), t: createTranslator(getMessages(locale)) };
}
