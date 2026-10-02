/**
 * Configuración de idiomas (i18n) compartida por el servidor y el cliente.
 *
 * [TFG] ADR-021: PymeKit solo se ofrece en español, pero la infraestructura
 * de traducción se conserva como punto de extensión. Cómo añadir un idioma
 * se explica en `packages/i18n/README.md`.
 */

/** Cookie that stores the user's chosen locale (root path so it's readable everywhere). */
export const LOCALE_COOKIE = 'locale';

/**
 * Idiomas que PymeKit trae traducidos de serie: solo el español (ADR-021).
 * Para añadir otro idioma se incluye aquí, se crean sus ficheros en
 * `messages/<idioma>/` y se registran en `messages/index.ts`.
 */
export const supportedLocales = ['es'] as const;

/**
 * Idioma por defecto: el que se usa cuando el usuario no ha elegido ninguno.
 * La fuente de verdad es la variable `VITE_DEFAULT_LOCALE` (Vite la incrusta al
 * compilar). Si falta, o trae un idioma no soportado (p. ej. `en`), se usa
 * el español.
 */
const envLocale = import.meta.env.VITE_DEFAULT_LOCALE;

export const defaultLocale: string =
  envLocale && (supportedLocales as readonly string[]).includes(envLocale)
    ? envLocale
    : 'es';

/** Idiomas activos. Cualquier otro (cookie, variable…) se resuelve al por defecto. */
export const locales: string[] = [...supportedLocales];

export type Locale = string;

export function isValidLocale(
  locale: string | undefined | null,
): locale is Locale {
  return !!locale && locales.includes(locale);
}
