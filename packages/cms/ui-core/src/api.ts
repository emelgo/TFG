/**
 * Llamadas de la interfaz del CMS a su API (lado cliente).
 *
 * La interfaz del CMS (`/admin/cms/**`) no llama a `fetch` a mano: usa el
 * cliente RPC tipado de Hono (`@pymekit/cms-api/client`), cuyos tipos salen de
 * las propias rutas del servidor importadas con `import type`. Así, si una
 * ruta cambia su respuesta, la interfaz deja de compilar en lugar de fallar en
 * tiempo de ejecución, y ningún código de servidor llega al navegador.
 *
 * `createCmsApi` recibe la implementación de `fetch` por inyección: en el
 * navegador es la nativa (misma origen, *cookies* incluidas) y durante el SSR
 * la web pasa una que atiende la petición dentro del propio proceso (ver
 * `apps/web/src/lib/cms/cms-fetch.ts`). Este paquete no sabe nada de TanStack
 * Start ni del servidor.
 *
 * [TFG] RF-09 · ADR-011: interfaz y API del CMS comunicadas por RPC tipado.
 */
import {
  createHonoClient,
  handleHonoClientResponse,
} from '@pymekit/cms-api/client';
import type { GetNavigationRoute } from '@pymekit/cms-navigation/routes';
import type { GetAccountRoute } from '@pymekit/cms-settings/routes';

/** Implementación de `fetch` que usan los clientes RPC. */
export type CmsFetch = typeof fetch;

/**
 * Crea las funciones de acceso a la API del CMS que usa la interfaz base.
 *
 * @param options.fetch `fetch` que se usará en todas las llamadas. Si se
 *   omite, el cliente de Hono usa el `fetch` global.
 */
export function createCmsApi(options: { fetch?: CmsFetch } = {}) {
  const clientOptions = { fetch: options.fetch };

  return {
    /**
     * Devuelve la cuenta del CMS del usuario y las secciones que puede usar.
     * Lanza `ApiError` con `status` 401/403 si no tiene acceso.
     */
    async getAccount() {
      const client = createHonoClient<GetAccountRoute>(clientOptions);

      return handleHonoClientResponse(await client.v1.account.$get());
    },

    /**
     * Devuelve las tablas que el usuario puede leer (`GET /v1/navigation`),
     * en el orden configurado en `cms.table_metadata`.
     */
    async getNavigation() {
      const client = createHonoClient<GetNavigationRoute>(clientOptions);

      return handleHonoClientResponse(await client.v1.navigation.$get());
    },
  };
}

export type CmsApi = ReturnType<typeof createCmsApi>;

/** Respuesta de `GET /v1/account`: cuenta del CMS y secciones accesibles. */
export type CmsAccountData = Awaited<ReturnType<CmsApi['getAccount']>>;

/** Recurso legible (tabla) tal como lo devuelve `GET /v1/navigation`. */
export type CmsNavigationItem = Awaited<
  ReturnType<CmsApi['getNavigation']>
>[number];
