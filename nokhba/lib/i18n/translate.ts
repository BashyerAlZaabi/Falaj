import type { Messages } from "./messages";

export type TranslateValues = Record<string, string | number>;
export type Translator = ((key: string, values?: TranslateValues) => string) & {
  has: (key: string) => boolean;
  raw: Messages;
};

/** Build a t() over a flat dictionary. Interpolates {name} placeholders. */
export function createTranslator(messages: Messages): Translator {
  const t = ((key: string, values?: TranslateValues) => {
    let text = messages[key];
    if (text === undefined) {
      if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    if (values) for (const [k, v] of Object.entries(values)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  }) as Translator;
  t.has = (key) => key in messages;
  t.raw = messages;
  return t;
}
