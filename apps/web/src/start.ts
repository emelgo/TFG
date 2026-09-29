import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';

import {
  buildContentSecurityPolicy,
  generateCspNonce,
  isStrictCspEnabled,
} from './lib/csp.server';

/**
 * Global request middleware.
 *
 * - CSRF protection is scoped to server functions. Declaring this file opts out
 *   of the framework's default CSRF middleware, so it is registered explicitly
 *   below — do NOT remove it.
 * - Security headers: `X-Frame-Options: DENY` (anti-clickjacking — the
 *   authenticated dashboard must never be framable) and `X-Content-Type-Options:
 *   nosniff` on every response, matching the drizzle sibling's default posture.
 * - Strict CSP: opt-in via `ENABLE_STRICT_CSP=true`. Generates a per-request
 *   nonce, exposes it on the global Start context (so `getRouter` can tag
 *   framework scripts and emit the `csp-nonce` meta tag), and emits a
 *   nonce-based `Content-Security-Policy` header. Off by default.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

const securityHeadersMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    const nonce = isStrictCspEnabled() ? generateCspNonce() : undefined;

    // Expose the nonce on the global Start context so the SSR render can read
    // it via `getGlobalStartContext()` (see src/router.tsx) and tag every
    // framework-injected script.
    const result = await next(nonce ? { context: { nonce } } : undefined);

    setResponseHeader('X-Frame-Options', 'DENY');
    setResponseHeader('X-Content-Type-Options', 'nosniff');
    setResponseHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // HSTS: force HTTPS in production. Skipped in development where the app is served over http.
    if (process.env.NODE_ENV === 'production') {
      setResponseHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    if (nonce) {
      setResponseHeader(
        'Content-Security-Policy',
        buildContentSecurityPolicy(nonce),
      );
    }

    return result;
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, securityHeadersMiddleware],
}));
