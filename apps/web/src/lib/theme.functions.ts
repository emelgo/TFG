import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';

import { THEME_COOKIE, parseTheme } from './theme';

/**
 * Lee la *cookie* de tema en el servidor. Se usa en el `beforeLoad` de la
 * ruta raíz para pintar la clase correcta de `<html>` sin parpadeo en el
 * primer pintado.
 */
export const getServerTheme = createServerFn({ method: 'GET' }).handler(() => {
  return parseTheme(getCookie(THEME_COOKIE));
});
