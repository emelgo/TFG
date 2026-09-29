'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';

const THEME_COOKIE = 'theme';

interface ThemeContextValue {
  theme: Theme;
  /** The concrete theme, resolving `system` to the OS preference on the client. */
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(theme: Theme): Theme {
  if (theme !== 'system') {
    return theme;
  }

  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }

  return 'light';
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return;
  }

  const dark = resolveTheme(theme) === 'dark';
  const root = document.documentElement;

  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
}

function persistTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Holds the current theme, applies the `dark`/`light` class to the document, and
 * persists the choice to a cookie so the server can render the correct theme on
 * the next request. Seed `initialTheme` from the server-read cookie.
 */
export function ThemeProvider({
  initialTheme,
  children,
}: React.PropsWithChildren<{ initialTheme: Theme }>) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    persistTheme(next);
  }, []);

  // The root route re-renders the `<html>` class from the theme cookie, which
  // renders `system` as `light`. Re-apply the resolved theme after every commit
  // (before paint) so navigations don't drop the OS preference.
  useLayoutEffect(() => {
    applyTheme(theme);
  });

  // Follow OS preference changes while in `system` mode.
  useEffect(() => {
    if (theme !== 'system') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');

    media.addEventListener('change', onChange);

    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme: resolveTheme(theme), setTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);

  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return ctx;
}
