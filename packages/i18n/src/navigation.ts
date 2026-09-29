import { useCallback } from 'react';

import { LOCALE_COOKIE, isValidLocale, locales } from './config';

/**
 * Locale-aware navigation helpers.
 *
 * The old `createNavigation`/routing helpers have been dropped: TanStack Router
 * owns routing, so `Link` is re-exported as-is. Locale switching is cookie-driven
 * (single-locale today), so `useChangeLocale` writes the cookie and reloads.
 */
export { Link } from '@tanstack/react-router';

/** Extract the locale from a pathname, or `null` if it carries no locale prefix. */
export function getLocaleFromPath(pathname: string): string | null {
  const segment = pathname.split('/').filter(Boolean)[0];

  return isValidLocale(segment) ? segment : null;
}

/**
 * Persist the chosen locale in the `locale` cookie and reload so the server
 * re-resolves the locale for the next render. No-op for unknown locales.
 */
export function useChangeLocale() {
  return useCallback((locale: string) => {
    if (!locales.includes(locale) || typeof document === 'undefined') {
      return;
    }

    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(
      locale,
    )}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

    window.location.reload();
  }, []);
}
