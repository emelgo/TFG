/**
 * Llamadas de la interfaz del CMS a los paneles y sus *widgets* (lado
 * cliente, F2.8).
 *
 * Igual que el resto de `./api`, usan el cliente RPC tipado de Hono con los
 * tipos de las rutas importados con `import type`: ningún código de servidor
 * llega al navegador. `createCmsApi` las incorpora a su objeto, así que los
 * componentes las usan con `useCmsApi().api`.
 *
 * Toda la autorización ocurre en la API y en la base de datos (editar,
 * compartir, permiso de lectura de cada tabla para quien mira el panel); la
 * interfaz solo oculta las acciones que la API rechazaría.
 *
 * [TFG] RF-11 · ADR-011 · ADR-013.
 */
import {
  createHonoClient,
  handleHonoClientResponse,
} from '@pymekit/cms-api/client';
import type {
  CreateDashboardRoute,
  CreateWidgetRoute,
  DeleteDashboardRoute,
  DeleteWidgetRoute,
  GetDashboardRoute,
  GetDashboardsRoute,
  GetWidgetDataRoute,
  ShareDashboardRoute,
  UnshareDashboardRoute,
  UpdateDashboardRoute,
  UpdateWidgetPositionsRoute,
  UpdateWidgetRoute,
} from '@pymekit/cms-dashboards/routes';
import type {
  DashboardShareLevel,
  WidgetDefinition,
  WidgetPosition,
} from '@pymekit/cms-shared/dashboards';

type ClientOptions = { fetch?: typeof fetch };

/** Filtro del listado: todos, propios o compartidos conmigo. */
export type DashboardsListFilter = 'all' | 'owned' | 'shared';

/** Página, búsqueda y filtro del listado de paneles. */
export type DashboardsListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  filter?: DashboardsListFilter;
};

/** Traduce los parámetros del listado a la *query string* (sin vacíos). */
export function toDashboardsQuery(params: DashboardsListParams) {
  const query: Record<string, string> = {};

  if (params.page && params.page > 1) query['page'] = String(params.page);
  if (params.pageSize) query['pageSize'] = String(params.pageSize);
  if (params.search) query['search'] = params.search;
  if (params.filter && params.filter !== 'all') query['filter'] = params.filter;

  return query;
}

/** Crea las funciones de acceso a los paneles. */
export function createDashboardsApi(clientOptions: ClientOptions) {
  return {
    /** Página de paneles propios y compartidos con alguno de mis roles. */
    async getDashboards(params: DashboardsListParams) {
      const client = createHonoClient<GetDashboardsRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.dashboards.$get({ query: toDashboardsQuery(params) }),
      );
    },

    /**
     * Un panel con sus *widgets* y lo que puedo hacer con él. Lanza
     * `ApiError` 404 si no existe o no tengo acceso.
     */
    async getDashboard(id: string) {
      const client = createHonoClient<GetDashboardRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.dashboards[':id'].$get({ param: { id } }),
      );
    },

    async createDashboard(data: { name: string }) {
      const client = createHonoClient<CreateDashboardRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.dashboards.$post({ json: data }),
      );
    },

    async renameDashboard(params: { id: string; name: string }) {
      const client = createHonoClient<UpdateDashboardRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.dashboards[':id'].$put({
          param: { id: params.id },
          json: { name: params.name },
        }),
      );
    },

    /** Borra un panel. Lanza `ApiError` 403 si no soy su propietario. */
    async deleteDashboard(id: string) {
      const client = createHonoClient<DeleteDashboardRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.dashboards[':id'].$delete({ param: { id } }),
      );
    },

    /**
     * Comparte un panel con un rol. Lanza `ApiError` 403 con
     * `DASHBOARD_SHARE_RANK_DENIED` si el rol no es de rango inferior.
     */
    async shareDashboard(params: {
      id: string;
      roleId: string;
      permissionLevel: DashboardShareLevel;
    }) {
      const client = createHonoClient<ShareDashboardRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.dashboards[':id'].share.$post({
          param: { id: params.id },
          json: {
            roleId: params.roleId,
            permissionLevel: params.permissionLevel,
          },
        }),
      );
    },

    async unshareDashboard(params: { id: string; roleId: string }) {
      const client = createHonoClient<UnshareDashboardRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.dashboards[':id'].shares[':roleId'].$delete({
          param: params,
        }),
      );
    },

    /** Crea un *widget* (la API busca hueco si la posición está ocupada). */
    async createWidget(
      data: WidgetDefinition & {
        dashboardId: string;
        position?: WidgetPosition;
      },
    ) {
      const client = createHonoClient<CreateWidgetRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.widgets.$post({ json: data }),
      );
    },

    /** Reemplaza la definición de un *widget* (no su posición). */
    async updateWidget(params: { id: string; definition: WidgetDefinition }) {
      const client = createHonoClient<UpdateWidgetRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.widgets[':id'].$put({
          param: { id: params.id },
          json: params.definition,
        }),
      );
    },

    async deleteWidget(id: string) {
      const client = createHonoClient<DeleteWidgetRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.widgets[':id'].$delete({ param: { id } }),
      );
    },

    /** Guarda las posiciones de los *widgets* movidos de un panel. */
    async updateWidgetPositions(data: {
      dashboardId: string;
      updates: Array<{ id: string; position: WidgetPosition }>;
    }) {
      const client =
        createHonoClient<UpdateWidgetPositionsRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.widgets.positions.$put({ json: data }),
      );
    },

    /**
     * Datos de un *widget* para el usuario actual. Lanza `ApiError` 403 con
     * `DASHBOARD_WIDGET_NO_ACCESS` si no puede leer la tabla del *widget*.
     */
    async getWidgetData(params: { id: string; page?: number }) {
      const client = createHonoClient<GetWidgetDataRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.widgets[':id'].data.$get({
          param: { id: params.id },
          query: params.page ? { page: String(params.page) } : {},
        }),
      );
    },
  };
}
