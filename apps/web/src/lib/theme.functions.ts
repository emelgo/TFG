import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';

import { THEME_COOKIE, parseTheme } from './theme';

/**
 * @name getServerTheme
 * @description Read the theme cookie on the server, used in the root route
 * `beforeLoad` to render the correct `<html>` class with no flash of the wrong
 * theme on first paint. The client persists the cookie via the theme provider.
 */
export const getServerTheme = createServerFn({ method: 'GET' }).handler(() => {
  return parseTheme(getCookie(THEME_COOKIE));
});
