import { en, type Dictionary } from "./en";
import { fr } from "./fr";

export type Locale = "en" | "fr";
export const LOCALES: readonly Locale[] = ["en", "fr"];
export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { en, fr };

export function getDictionary(locale: string): Dictionary {
  return dictionaries[(LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : "en"];
}

/** "{count} items" + { count: 3 } → "3 items". Unknown placeholders are left visible on purpose. */
export function t(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
