import type { Locale } from "./config";

const intlLocale = (l: Locale) => (l === "ar" ? "ar-AE" : "en-AE");

export const formatNumber = (n: number, locale: Locale, opts?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(intlLocale(locale), opts).format(n);

export const formatPercent = (n: number, locale: Locale) =>
  new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(n / 100);

export const formatDate = (d: Date | string, locale: Locale, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
  new Intl.DateTimeFormat(intlLocale(locale), opts).format(typeof d === "string" ? new Date(d) : d);

export const formatRelative = (d: Date | string, locale: Locale) => {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return rtf.format(Math.round(diff / (86400 * 30)), "month");
};

/** "1h 20m" / "١ س ٢٠ د" */
export const formatDuration = (minutes: number, locale: Locale) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const n = (v: number) => formatNumber(v, locale);
  if (locale === "ar") return h ? `${n(h)} س${m ? ` ${n(m)} د` : ""}` : `${n(m)} د`;
  return h ? `${n(h)}h${m ? ` ${n(m)}m` : ""}` : `${n(m)}m`;
};
