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
import type {
  CreateSavedViewRoute,
  DeleteSavedViewRoute,
  GetSavedViewsRoute,
  GetTableRoute,
  UpdateSavedViewRoute,
} from '@pymekit/cms-data-explorer/routes';
import type { GetNavigationRoute } from '@pymekit/cms-navigation/routes';
import type { GetRolesForSharingRoute } from '@pymekit/cms-permissions/routes';
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

    /**
     * Devuelve una página de filas de una tabla (`GET /v1/tables/:schema/:table`)
     * junto con su metadato (`table`, `columns`), las etiquetas de las
     * relaciones de las filas (`relations`) y la paginación.
     *
     * La API vuelve a comprobar el permiso `select` sobre la tabla: si no lo
     * tiene, responde 403 y se lanza `ApiError`.
     */
    async getTableData(params: TableDataParams) {
      const client = createHonoClient<GetTableRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][':table'].$get({
        param: { schema: params.schema, table: params.table },
        query: toTableDataQuery(params),
      });

      return handleHonoClientResponse(response);
    },

    /** Devuelve las vistas guardadas (personales y de equipo) de una tabla. */
    async getSavedViews(params: { schema: string; table: string }) {
      const client = createHonoClient<GetSavedViewsRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][':table'].views.$get({
        param: params,
      });

      return handleHonoClientResponse(response);
    },

    /** Crea una vista guardada con los filtros, la ordenación y la búsqueda. */
    async createSavedView(params: {
      schema: string;
      table: string;
      data: SavedViewInput;
    }) {
      const client = createHonoClient<CreateSavedViewRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][':table'].views.$post({
        param: { schema: params.schema, table: params.table },
        json: params.data,
      });

      return handleHonoClientResponse(response);
    },

    /** Actualiza una vista guardada propia (la BD rechaza las ajenas). */
    async updateSavedView(params: {
      schema: string;
      table: string;
      id: string;
      data: Partial<SavedViewInput>;
    }) {
      const client = createHonoClient<UpdateSavedViewRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][':table'].views[
        ':id'
      ].$put({
        param: { schema: params.schema, table: params.table, id: params.id },
        json: params.data,
      });

      return handleHonoClientResponse(response);
    },

    /** Borra una vista guardada propia. */
    async deleteSavedView(params: {
      schema: string;
      table: string;
      id: string;
    }) {
      const client = createHonoClient<DeleteSavedViewRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][':table'].views[
        ':id'
      ].$delete({ param: params });

      return handleHonoClientResponse(response);
    },

    /** Devuelve los roles con los que el usuario puede compartir una vista. */
    async getRolesForSharing() {
      const client = createHonoClient<GetRolesForSharingRoute>(clientOptions);

      return handleHonoClientResponse(await client.v1.roles.sharing.$get());
    },
  };
}

/**
 * Parámetros de una consulta del listado de una tabla. Los filtros van con el
 * formato de la API: `{ "columna.operador": "valor" }`.
 */
export type TableDataParams = {
  schema: string;
  table: string;
  page?: number;
  pageSize?: number;
  search?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, string>;
};

/** Datos que acepta la API para crear o actualizar una vista guardada. */
export type SavedViewInput = {
  name: string;
  description?: string;
  roles?: string[];
  config: {
    filters: Array<{
      name: string;
      values: Array<{ operator: string; value: unknown }>;
    }>;
    sort?: { column?: string; direction?: 'asc' | 'desc' };
    search?: string;
  };
};

/**
 * Traduce los parámetros del listado a la *query string* de la API: solo se
 * envían los que tienen valor, y los filtros viajan serializados en JSON en
 * `properties`, que es lo que interpreta el servidor.
 */
export function toTableDataQuery(params: TableDataParams) {
  const query: {
    page?: string;
    page_size?: string;
    search?: string;
    sort_column?: string;
    sort_direction?: 'asc' | 'desc';
    properties?: string;
  } = {};

  if (params.page) {
    query.page = String(params.page);
  }

  if (params.pageSize) {
    query.page_size = String(params.pageSize);
  }

  if (params.search) {
    query.search = params.search;
  }

  if (params.sortColumn) {
    query.sort_column = params.sortColumn;
    query.sort_direction = params.sortDirection ?? 'asc';
  }

  if (params.filters && Object.keys(params.filters).length > 0) {
    query.properties = JSON.stringify(params.filters);
  }

  return query;
}

export type CmsApi = ReturnType<typeof createCmsApi>;

/** Respuesta de `GET /v1/account`: cuenta del CMS y secciones accesibles. */
export type CmsAccountData = Awaited<ReturnType<CmsApi['getAccount']>>;

/** Recurso legible (tabla) tal como lo devuelve `GET /v1/navigation`. */
export type CmsNavigationItem = Awaited<
  ReturnType<CmsApi['getNavigation']>
>[number];

/** Respuesta del listado de una tabla (`GET /v1/tables/:schema/:table`). */
export type CmsTableData = Awaited<ReturnType<CmsApi['getTableData']>>;

/** Vistas guardadas de una tabla, separadas en personales y de equipo. */
export type CmsSavedViews = Awaited<ReturnType<CmsApi['getSavedViews']>>;

/** Una vista guardada tal como la devuelve la API. */
export type CmsSavedView = CmsSavedViews['personal'][number];
