/**
 * Internationalization configuration.
 *
 * Public locale settings shared by the server and client. Add a locale by
 * adding it to `locales` and creating its message files under `messages/`.
 */

/** Cookie that stores the user's chosen locale (root path so it's readable everywhere). */
export const LOCALE_COOKIE = 'locale';

/**
 * The default locale, used when none is chosen and as the unprefixed locale.
 * Single source of truth: the `VITE_DEFAULT_LOCALE` env var (inlined by Vite),
 * falling back to `en`.
 */
export const defaultLocale = import.meta.env.VITE_DEFAULT_LOCALE ?? 'en';

/** All supported locales. Extend this list to enable more languages. */
export const locales: string[] = [
  defaultLocale,
  // 'es',
  // 'fr',
];

export type Locale = string;

export function isValidLocale(
  locale: string | undefined | null,
): locale is Locale {
  return !!locale && locales.includes(locale);
}
