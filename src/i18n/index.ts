import { vi, type Messages } from "./vi";
import { en } from "./en";

export { vi, en };
export type { Messages };

export type Locale = "vi" | "en";

export const defaultLocale: Locale = "vi";

export const dictionaries: Record<Locale, Messages> = {
  vi,
  en,
};

/**
 * Returns dictionary for specified locale, defaulting to Vietnamese.
 */
export function getDictionary(locale: Locale = defaultLocale): Messages {
  return dictionaries[locale] || vi;
}

/**
 * Interpolates `{variable}` placeholders in strings.
 * Example: interpolate("Hello {name}", { name: "World" }) -> "Hello World"
 */
export function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return key in params ? String(params[key]) : `{${key}}`;
  });
}
