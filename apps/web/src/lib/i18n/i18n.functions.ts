import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';

import { LOCALE_COOKIE, defaultLocale, isValidLocale } from '@pymekit/i18n';

/**
 * Resuelve el idioma activo de la petición actual.
 *
 * Precedencia: cookie `locale` (la escribe el selector de idioma) → idioma por
 * defecto (`VITE_DEFAULT_LOCALE`, español). No se usa la cabecera
 * `Accept-Language` a propósito: PymeKit se dirige a pymes españolas y el
 * producto debe abrirse siempre en español salvo que el usuario elija otro
 * idioma de forma explícita.
 *
 * Solo servidor: lee la petición mediante `@tanstack/react-start/server`.
 * Se llama desde el `beforeLoad` raíz.
 */
function resolveRequestLocale(): string {
  const cookie = getCookie(LOCALE_COOKIE);

  return isValidLocale(cookie) ? cookie : defaultLocale;
}

/**
 * Resolve the active locale on the server (cookie → idioma por defecto).
 * Called from the root `beforeLoad` and threaded into the router context.
 */
export const detectLocale = createServerFn({ method: 'GET' }).handler(() =>
  resolveRequestLocale(),
);
