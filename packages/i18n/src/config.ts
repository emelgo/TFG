/**
 * Internationalization configuration.
 *
 * Public locale settings shared by the server and client. Add a locale by
 * adding it to `locales` and creating its message files under `messages/`.
 */

/** Cookie that stores the user's chosen locale (root path so it's readable everywhere). */
export const LOCALE_COOKIE = 'locale';

/**
 * Idiomas que PymeKit trae traducidos de serie. El español es el idioma
 * principal del producto (va primero) y el inglés el secundario. Para añadir
 * otro idioma basta con incluirlo aquí y crear sus ficheros en `messages/`.
 */
export const supportedLocales = ['es', 'en'] as const;

/**
 * Idioma por defecto: el que se usa cuando el usuario no ha elegido ninguno.
 * La fuente de verdad es la variable `VITE_DEFAULT_LOCALE` (Vite la incrusta al
 * compilar). Si falta, o trae un idioma no soportado, se usa el español.
 */
const envLocale = import.meta.env.VITE_DEFAULT_LOCALE;

export const defaultLocale: string =
  envLocale && (supportedLocales as readonly string[]).includes(envLocale)
    ? envLocale
    : 'es';

/** Todos los idiomas disponibles en el selector de idioma. */
export const locales: string[] = [...supportedLocales];

export type Locale = string;

export function isValidLocale(
  locale: string | undefined | null,
): locale is Locale {
  return !!locale && locales.includes(locale);
}
