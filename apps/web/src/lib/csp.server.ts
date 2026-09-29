import { randomBytes } from 'node:crypto';

/**
 * Strict, nonce-based Content Security Policy. Opt-in and OFF by default —
 * enable with `ENABLE_STRICT_CSP=true` (ports the Next.js kit's behavior).
 *
 * Flow (see src/start.ts, src/router.tsx and src/routes/__root.tsx):
 * 1. `securityHeadersMiddleware` generates a per-request nonce, puts it on the
 *    global Start context (`next({ context: { nonce } })`), and emits the CSP
 *    header.
 * 2. `getRouter` reads the nonce via `getGlobalStartContext()` and sets
 *    `router.options.ssr.nonce`, so TanStack tags every framework-injected
 *    `<script>` (hydration/dehydration, `<Scripts>`, `<HeadContent>`) and emits
 *    the `csp-nonce` meta tag itself.
 * 3. The client recovers the nonce from that meta tag on hydration; it is also
 *    propagated to app consumers via Base UI's `CSPProvider` so its inline
 *    `<style>` elements carry the nonce.
 */

/**
 * The Supabase origin the browser client talks to directly (auth refresh,
 * PostgREST, Realtime, Storage). Public var, inlined by Vite (client + server)
 * — same mechanism as `getSupabaseClientKeys()` in `@pymekit/supabase`. Undefined
 * when unset or same-origin-relative (already covered by `'self'`).
 */
const SUPABASE_ORIGIN = getSupabaseOrigin();

/**
 * The `ws(s)://` form of the Supabase origin, required for Realtime
 * websocket connections under `connect-src`.
 */
const SUPABASE_WEBSOCKET_ORIGIN = SUPABASE_ORIGIN?.replace(
  'https://',
  'wss://',
).replace('http://', 'ws://');

function getSupabaseOrigin() {
  const url = import.meta.env.VITE_SUPABASE_URL;

  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).origin;
  } catch {
    // Relative/invalid URL: same-origin requests are already allowed by 'self'.
    return undefined;
  }
}

/**
 * Additional origins allowed for `connect-src` (XHR/fetch/websocket). Add API,
 * analytics, or webhook origins here when the strict CSP is enabled.
 */
const CONNECT_SRC_ORIGINS: string[] = [
  // Turnstile verification requests.
  'https://challenges.cloudflare.com',
  // Supabase API (auth/PostgREST/Storage) + Realtime websocket.
  ...(SUPABASE_ORIGIN && SUPABASE_WEBSOCKET_ORIGIN
    ? [SUPABASE_ORIGIN, SUPABASE_WEBSOCKET_ORIGIN]
    : []),
];

/**
 * Additional origins allowed for `frame-src` (embedded iframes).
 */
const FRAME_SRC_ORIGINS: string[] = [
  // Turnstile widget iframe.
  'https://challenges.cloudflare.com',
];

/**
 * Additional origins allowed for `img-src`.
 */
const IMG_SRC_ORIGINS: string[] = [
  // Supabase Storage images.
  ...(SUPABASE_ORIGIN ? [SUPABASE_ORIGIN] : []),
];

export function isStrictCspEnabled() {
  return process.env.ENABLE_STRICT_CSP === 'true';
}

/**
 * Generate a fresh per-request nonce (base64, 128 bits of entropy).
 */
export function generateCspNonce() {
  return randomBytes(16).toString('base64');
}

/**
 * Build the strict, nonce-based Content-Security-Policy header value.
 *
 * `script-src` follows the canonical strict-CSP recipe: `'strict-dynamic'` lets
 * scripts trusted via nonce load their own dependencies, while `https:` and
 * `'unsafe-inline'` are ignored by modern browsers and act only as fallbacks
 * for engines that support neither nonces nor `'strict-dynamic'`.
 *
 * `style-src` intentionally keeps `'unsafe-inline'`: nonces do not apply to
 * inline `style="…"` attributes (which React emits for dynamic styles), so a
 * strict `style-src` would break the app for little security gain. The strict
 * guarantees here are on scripts.
 */
export function buildContentSecurityPolicy(nonce: string) {
  const isProduction = process.env.NODE_ENV === 'production';

  const directives: Array<[string, string[] | true]> = [
    ['default-src', ["'self'"]],
    ['base-uri', ["'none'"]],
    ['object-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['form-action', ["'self'"]],
    [
      'script-src',
      [
        "'self'",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        'https:',
        "'unsafe-inline'",
      ],
    ],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'blob:', 'data:', ...IMG_SRC_ORIGINS]],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", ...CONNECT_SRC_ORIGINS]],
    ['frame-src', ["'self'", ...FRAME_SRC_ORIGINS]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['media-src', ["'self'"]],
    ...(isProduction
      ? ([['upgrade-insecure-requests', true]] as Array<[string, true]>)
      : []),
  ];

  return directives
    .map(([name, value]) =>
      value === true ? name : `${name} ${value.join(' ')}`,
    )
    .join('; ');
}
