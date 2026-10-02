/**
 * Llamadas de la interfaz del CMS al registro de auditoría y a la búsqueda
 * global (lado cliente, F2.6).
 *
 * Igual que el resto de `./api`, usan el cliente RPC tipado de Hono con los
 * tipos de las rutas importados con `import type`: ningún código de servidor
 * llega al navegador. `createCmsApi` las incorpora a su objeto, así que los
 * componentes las usan con `useCmsApi().api`.
 *
 * Toda la autorización ocurre en la API y en la base de datos: la interfaz
 * solo pide y muestra lo que le devuelven (entradas filtradas por rango, datos
 * redactados y resultados de tablas legibles).
 *
 * [TFG] RF-09 · RF-10 · ADR-011.
 */
import {
  createHonoClient,
  handleHonoClientResponse,
} from '@pymekit/cms-api/client';
import type {
  GetAuditLogDetailsRoute,
  GetAuditLogsRoute,
  GetMemberAuditLogsRoute,
} from '@pymekit/cms-audit-logs/routes';
import type { GetGlobalSearchRoute } from '@pymekit/cms-resources/routes';

type ClientOptions = { fetch?: typeof fetch };

/** Gravedad de una entrada de auditoría. */
export type AuditLogSeverity = 'info' | 'warning' | 'error';

/** Filtros y página del listado general del registro de auditoría. */
export type AuditLogsListParams = {
  cursor?: string;
  limit?: number;
  /** Id (o parte) de la cuenta del CMS o del usuario que actuó. */
  author?: string;
  /** Operaciones exactas (`INSERT`, `ban_user`…). */
  actions?: string[];
  schema?: string;
  table?: string;
  severity?: AuditLogSeverity;
  /** Día UTC `AAAA-MM-DD`, incluido. */
  startDate?: string;
  /** Día UTC `AAAA-MM-DD`, incluido. */
  endDate?: string;
};

/** Página del registro de un miembro. */
export type MemberAuditLogsParams = {
  accountId: string;
  cursor?: string;
  limit?: number;
};

/**
 * Traduce los filtros a la *query string* de la API (sin valores vacíos;
 * las operaciones van separadas por comas).
 */
export function toAuditLogsQuery(params: AuditLogsListParams) {
  const query: Record<string, string> = {};

  if (params.cursor) query['cursor'] = params.cursor;
  if (params.limit) query['limit'] = String(params.limit);
  if (params.author) query['author'] = params.author;
  if (params.actions && params.actions.length > 0) {
    query['action'] = params.actions.join(',');
  }
  if (params.schema) query['schema'] = params.schema;
  if (params.table) query['table'] = params.table;
  if (params.severity) query['severity'] = params.severity;
  if (params.startDate) query['startDate'] = params.startDate;
  if (params.endDate) query['endDate'] = params.endDate;

  return query;
}

/** Crea las funciones de acceso al registro de auditoría y a la búsqueda. */
export function createAuditLogsApi(clientOptions: ClientOptions) {
  return {
    /**
     * Página del registro de auditoría. Lanza `ApiError` 403 sin el permiso
     * `log:select` y 400 con filtros o cursor no válidos.
     */
    async getAuditLogs(params: AuditLogsListParams) {
      const client = createHonoClient<GetAuditLogsRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1['audit-logs'].$get({ query: toAuditLogsQuery(params) }),
      );
    },

    /**
     * Una entrada con el correo de su autor. Lanza `ApiError` 404 si no
     * existe o el usuario no puede leerla.
     */
    async getAuditLog(id: string) {
      const client = createHonoClient<GetAuditLogDetailsRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1['audit-logs'][':id'].$get({ param: { id } }),
      );
    },

    /**
     * Entradas de una cuenta del CMS. Lanza `ApiError` 403 si su rango es
     * superior al del usuario.
     */
    async getMemberAuditLogs(params: MemberAuditLogsParams) {
      const client = createHonoClient<GetMemberAuditLogsRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1['audit-logs'].member[':id'].$get({
          param: { id: params.accountId },
          query: {
            ...(params.cursor ? { cursor: params.cursor } : {}),
            ...(params.limit ? { limit: String(params.limit) } : {}),
          },
        }),
      );
    },

    /**
     * Búsqueda global en las tablas legibles: título, tabla y clave primaria
     * de cada coincidencia (sin la fila). Lanza `ApiError` 400 con un texto
     * de menos de 2 o más de 100 caracteres.
     */
    async globalSearch(params: { query: string; limit?: number }) {
      const client = createHonoClient<GetGlobalSearchRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.resources.search.$get({
          query: {
            query: params.query,
            ...(params.limit ? { limit: String(params.limit) } : {}),
          },
        }),
      );
    },
  };
}
