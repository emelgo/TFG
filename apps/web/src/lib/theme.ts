/**
 * Theme helpers for the root document.
 *
 * The theme is resolved server-side from the `theme` cookie (see
 * `theme.functions.ts`) and rendered into the `<html>` class in the root shell,
 * so there is no flash of the wrong theme. The client persists changes via
 * `@pymekit/ui/theme`'s `ThemeProvider`.
 */
import { cn } from '@pymekit/ui/utils';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_COOKIE = 'theme';

const fallbackTheme: Theme = 'light';

/**
 * @name getDefaultTheme
 * @description Resolve the default theme from `VITE_DEFAULT_THEME_MODE`,
 * falling back to `light`.
 */
export function getDefaultTheme(): Theme {
  const value = import.meta.env.VITE_DEFAULT_THEME_MODE;

  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return fallbackTheme;
}

/**
 * @name parseTheme
 * @description Resolve a theme from a raw cookie value, falling back to the
 * configured default.
 */
export function parseTheme(rawValue: string | undefined): Theme {
  if (rawValue === 'light' || rawValue === 'dark' || rawValue === 'system') {
    return rawValue;
  }

  return getDefaultTheme();
}

/**
 * @name getRootClassName
 * @description Build the class list for the root <html> element. `system` is
 * rendered as light; an inline script in the root `<head>` switches it to dark
 * before first paint when the OS prefers dark.
 */
export function getRootClassName(theme: Theme) {
  const dark = theme === 'dark';

  return cn('bg-background min-h-screen antialiased md:overscroll-y-none', {
    dark,
    light: !dark,
  });
}
