import type { Response } from '@playwright/test';

/**
 * Default base path TanStack Start dispatches server functions to
 * (`createServerFn`). Every action/loader server fn is fetched as
 * `${SERVER_FN_BASE}/<functionId>` regardless of the page route, unlike
 * Next.js `'use server'` RPC functions which POST to the current page path.
 */
export const SERVER_FN_BASE = '/_serverFn';

/**
 * Matches a TanStack Start server-function response in `page.waitForResponse`.
 *
 * Notes vs the old Next.js server-action waits:
 * - URL is `/_serverFn/...`, not the page path (e.g. `/settings`, `/admin/...`).
 * - Success replies 200 (JSON); redirect-throwing fns reply 307, not 303 — so
 *   omit `status` when waiting on an action that throws `redirect()`.
 */
export function isServerFnResponse(
  response: Response,
  opts: { method?: 'GET' | 'POST'; status?: number | number[] } = {},
) {
  if (!response.url().includes(SERVER_FN_BASE)) {
    return false;
  }

  if (
    opts.method &&
    response.request().method().toUpperCase() !== opts.method
  ) {
    return false;
  }

  if (opts.status !== undefined) {
    const allowed = Array.isArray(opts.status) ? opts.status : [opts.status];

    if (!allowed.includes(response.status())) {
      return false;
    }
  }

  return true;
}
