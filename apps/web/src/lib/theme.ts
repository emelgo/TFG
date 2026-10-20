/**
 * Utilidades del tema (claro u oscuro) del documento raíz.
 *
 * El tema se resuelve en el servidor a partir de la *cookie* `theme` (ver
 * `theme.functions.ts`) y se pinta como clase de `<html>` desde el principio,
 * para que no haya un parpadeo con el tema equivocado. El cliente guarda los
 * cambios con el `ThemeProvider` de `@pymekit/ui/theme`.
 */
import { cn } from '@pymekit/ui/utils';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_COOKIE = 'theme';

const fallbackTheme: Theme = 'light';

/**
 * Devuelve el tema por defecto de `VITE_DEFAULT_THEME_MODE` o, si no es
 * válido, `light`.
 */
export function getDefaultTheme(): Theme {
  const value = import.meta.env.VITE_DEFAULT_THEME_MODE;

  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return fallbackTheme;
}

/**
 * Interpreta el valor de la *cookie* de tema; si no es válido, usa el tema
 * por defecto configurado.
 */
export function parseTheme(rawValue: string | undefined): Theme {
  if (rawValue === 'light' || rawValue === 'dark' || rawValue === 'system') {
    return rawValue;
  }

  return getDefaultTheme();
}

/**
 * Construye las clases del elemento `<html>`. El tema `system` se pinta como
 * claro y un script en línea del `<head>` lo cambia a oscuro antes del primer
 * pintado si el sistema operativo lo prefiere.
 */
export function getRootClassName(theme: Theme) {
  const dark = theme === 'dark';

  return cn('bg-background min-h-screen antialiased md:overscroll-y-none', {
    dark,
    light: !dark,
  });
}
