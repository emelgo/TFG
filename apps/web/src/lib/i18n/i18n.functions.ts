import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';

import { LOCALE_COOKIE, defaultLocale, isValidLocale } from '@pymekit/i18n';

/**
 * Resuelve el idioma activo de la petición actual.
 *
 * Precedencia: cookie `locale` (solo si es un idioma configurado) → idioma
 * por defecto (español). Hoy solo existe `es` (ADR-021), así que una cookie
 * antigua con `en` se ignora. No se usa la cabecera `Accept-Language` a
 * propósito: PymeKit se dirige a pymes españolas y el producto debe abrirse
 * siempre en español.
 *
 * Solo servidor: lee la petición mediante `@tanstack/react-start/server`.
 * Se llama desde el `beforeLoad` raíz.
 */
function resolveRequestLocale(): string {
  const cookie = getCookie(LOCALE_COOKIE);

  return isValidLocale(cookie) ? cookie : defaultLocale;
}

/**
 * Resuelve el idioma activo en el servidor (cookie → idioma por defecto).
 * La llama el `beforeLoad` raíz y el valor viaja en el contexto del router.
 */
export const detectLocale = createServerFn({ method: 'GET' }).handler(() =>
  resolveRequestLocale(),
);
