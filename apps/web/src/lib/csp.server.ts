import { randomBytes } from 'node:crypto';

/**
 * Política de seguridad de contenidos (CSP) estricta basada en *nonce*.
 *
 * Es opcional y está DESACTIVADA por defecto; se activa con
 * `ENABLE_STRICT_CSP=true`. Limita de dónde puede cargar la página scripts,
 * estilos, imágenes y conexiones, lo que reduce mucho el impacto de un
 * posible XSS.
 *
 * Flujo (ver src/start.ts, src/router.tsx y src/routes/__root.tsx):
 * 1. `securityHeadersMiddleware` genera un *nonce* por petición, lo guarda en
 *    el contexto global de Start (`next({ context: { nonce } })`) y emite la
 *    cabecera CSP.
 * 2. `getRouter` lee el *nonce* con `getGlobalStartContext()` y lo pone en
 *    `router.options.ssr.nonce`, de modo que TanStack lo añade a todos los
 *    `<script>` que inyecta el *framework* (hidratación, `<Scripts>`,
 *    `<HeadContent>`) y emite él mismo la etiqueta meta `csp-nonce`.
 * 3. En el cliente, el *nonce* se recupera de esa etiqueta al hidratar y se
 *    pasa a los componentes con el `CSPProvider` de Base UI, para que sus
 *    `<style>` en línea también lo lleven.
 *
 * [TFG] RNF-02 Seguridad.
 */

/**
 * Origen de Supabase con el que habla directamente el navegador (refresco de
 * sesión, PostgREST, Realtime, Storage). Es una variable pública que Vite
 * incrusta, igual que en `getSupabaseClientKeys()` de `@pymekit/supabase`.
 * Vale `undefined` si no está definida o es relativa (ya la cubre `'self'`).
 */
const SUPABASE_ORIGIN = getSupabaseOrigin();

/**
 * El mismo origen con esquema `ws(s)://`, necesario en `connect-src` para las
 * conexiones WebSocket de Realtime.
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
    // URL relativa o no válida: las peticiones al mismo origen ya las permite
    // 'self'.
    return undefined;
  }
}

/**
 * Orígenes adicionales permitidos en `connect-src` (fetch/XHR/WebSocket). Si
 * se activa la CSP estricta y se añaden servicios externos (API, analítica),
 * hay que incluir aquí su origen.
 */
const CONNECT_SRC_ORIGINS: string[] = [
  // Verificación del CAPTCHA (Turnstile).
  'https://challenges.cloudflare.com',
  // API de Supabase (Auth, PostgREST, Storage) y WebSocket de Realtime.
  ...(SUPABASE_ORIGIN && SUPABASE_WEBSOCKET_ORIGIN
    ? [SUPABASE_ORIGIN, SUPABASE_WEBSOCKET_ORIGIN]
    : []),
];

/** Orígenes adicionales permitidos en `frame-src` (iframes incrustados). */
const FRAME_SRC_ORIGINS: string[] = [
  // Iframe del widget de Turnstile.
  'https://challenges.cloudflare.com',
];

/** Orígenes adicionales permitidos en `img-src`. */
const IMG_SRC_ORIGINS: string[] = [
  // Imágenes servidas por Supabase Storage.
  ...(SUPABASE_ORIGIN ? [SUPABASE_ORIGIN] : []),
];

/** Indica si la CSP estricta está activada por entorno. */
export function isStrictCspEnabled() {
  return process.env.ENABLE_STRICT_CSP === 'true';
}

/**
 * Genera un *nonce* nuevo por petición (base64, 128 bits de entropía). Debe
 * ser impredecible: si un atacante lo adivinara, podría ejecutar su script.
 */
export function generateCspNonce() {
  return randomBytes(16).toString('base64');
}

/**
 * Construye el valor de la cabecera Content-Security-Policy estricta.
 *
 * `script-src` sigue la receta habitual de CSP estricta: `'strict-dynamic'`
 * permite que los scripts autorizados por *nonce* carguen sus dependencias,
 * mientras que `https:` y `'unsafe-inline'` los ignoran los navegadores
 * modernos y solo sirven de respaldo para los que no admiten ni *nonces* ni
 * `'strict-dynamic'`.
 *
 * `style-src` mantiene `'unsafe-inline'` a propósito: los *nonces* no se
 * aplican a los atributos `style="…"` (que React genera para estilos
 * dinámicos), así que un `style-src` estricto rompería la aplicación con poca
 * ganancia de seguridad. Las garantías fuertes están en los scripts.
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
