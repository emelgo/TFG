/**
 * `fetch` isomorfo para el cliente RPC de la API del CMS.
 *
 * Los *loaders* de TanStack Router se ejecutan en dos sitios: en el servidor
 * durante el SSR (primera carga) y en el navegador en las navegaciones
 * siguientes. El cliente RPC necesita un `fetch` que funcione en ambos:
 *
 *  - **Navegador:** el `fetch` nativo contra `/api/cms/*` (misma origen), que
 *    envía las *cookies* de sesión.
 *  - **Servidor:** una ruta relativa no se puede resolver y, además, llamar a
 *    la propia web por HTTP sería un salto de red innecesario (y dependería de
 *    cómo esté expuesto el puerto detrás del *proxy*). En su lugar se construye
 *    una `Request` con la URL absoluta de la petición entrante y su cabecera
 *    `cookie`, y se entrega directamente a la aplicación Hono del CMS en el
 *    mismo proceso. Pasa exactamente por el mismo *middleware* de
 *    autenticación, CSRF y RLS que una petición del navegador.
 *
 * `createIsomorphicFn` hace que el compilador de TanStack Start elimine la
 * rama `.server()` del *bundle* del cliente; los `import()` dinámicos de esa
 * rama (Hono del CMS, Drizzle, utilidades de servidor) desaparecen con ella.
 *
 * Limitación conocida: si durante el SSR Supabase rota el *token* de la
 * sesión, la API recibe las *cookies* originales de la petición (igual que el
 * resto de *server functions* de la web) y las *cookies* nuevas que pudiera
 * emitir la API se descartan; el refresco persistente lo hace el `beforeLoad`
 * raíz (`fetchSession`).
 *
 * [TFG] RF-09 · ADR-011: una sola aplicación sirve la interfaz y la API del
 * CMS, también durante el renderizado en servidor.
 */
import { createIsomorphicFn } from '@tanstack/react-start';

/** Firma de `fetch` que espera el cliente RPC de Hono. */
type FetchArgs = Parameters<typeof fetch>;

/**
 * Devuelve la URL (posiblemente relativa) de la entrada de `fetch`.
 */
function getInputUrl(input: FetchArgs[0]) {
  if (typeof input === 'string') {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

export const cmsFetch = createIsomorphicFn()
  .server(async (input: FetchArgs[0], init?: FetchArgs[1]) => {
    const [{ getRequest }, { getCmsApiApp }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('./cms-api-app.server.ts'),
    ]);

    const incoming = getRequest();
    const url = new URL(getInputUrl(input), incoming.url);
    const headers = new Headers(init?.headers);
    const cookie = incoming.headers.get('cookie');

    // Solo se reenvía la cabecera `cookie` (la sesión de Supabase): el resto
    // de cabeceras de la petición entrante no pinta nada en una llamada a la
    // API y así no se filtran datos que la API no espera.
    if (cookie) {
      headers.set('cookie', cookie);
    }

    const app = await getCmsApiApp();

    return app.fetch(new Request(url, { ...init, headers }));
  })
  .client((input: FetchArgs[0], init?: FetchArgs[1]) => fetch(input, init));
