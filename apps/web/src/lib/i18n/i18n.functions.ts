import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';

import {
  LOCALE_COOKIE,
  defaultLocale,
  isValidLocale,
  locales,
} from '@pymekit/i18n';

/**
 * Resolve the active locale for the current request.
 *
 * Precedence: `locale` cookie → `Accept-Language` header → default. While a
 * single locale is enabled this transparently falls back to the default.
 *
 * Server-only: reads the request via `@tanstack/react-start/server`. Call it
 * from the root `beforeLoad`, not from an arbitrary server function.
 */
function resolveRequestLocale(): string {
  const cookie = getCookie(LOCALE_COOKIE);

  if (isValidLocale(cookie)) {
    return cookie;
  }

  const header = getRequestHeader('accept-language') ?? '';

  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().split('-')[0];

    if (tag && locales.includes(tag)) {
      return tag;
    }
  }

  return defaultLocale;
}

/**
 * Resolve the active locale on the server (cookie → Accept-Language → default).
 * Called from the root `beforeLoad` and threaded into the router context.
 */
export const detectLocale = createServerFn({ method: 'GET' }).handler(() =>
  resolveRequestLocale(),
);
