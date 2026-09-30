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
  BatchDeleteRecordsRoute,
  CreateSavedViewRoute,
  DeleteRecordByConditionsRoute,
  DeleteSavedViewRoute,
  GetDataRecordPermissionsRoute,
  GetRecordRoute,
  GetSavedViewsRoute,
  GetTableMetadataRoute,
  GetTableRoute,
  InsertRecordRoute,
  M2MLinkRoute,
  M2MUnlinkRoute,
  UpdateRecordByConditionsRoute,
  UpdateSavedViewRoute,
} from '@pymekit/cms-data-explorer/routes';
import type { GetNavigationRoute } from '@pymekit/cms-navigation/routes';
import type { GetRolesForSharingRoute } from '@pymekit/cms-permissions/routes';
import type { GetAccountRoute } from '@pymekit/cms-settings/routes';

import { createStorageApi } from './storage-api';
import { createUsersApi } from './users-api';

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
    // Explorador de usuarios y de almacenamiento (F2.5), en ficheros propios
    // para que este no crezca sin control.
    ...createUsersApi(clientOptions),
    ...createStorageApi(clientOptions),

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

    /**
     * Devuelve el metadato de una tabla (`GET /v1/tables/:schema/:table/metadata`):
     * nombre visible, formato de las etiquetas, claves primarias y únicas
     * (`uiConfig`), relaciones y columnas. Exige permiso `select` (403 si no).
     */
    async getTableMetadata(params: { schema: string; table: string }) {
      const client = createHonoClient<GetTableMetadataRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][
        ':table'
      ].metadata.$get({ param: params });

      return handleHonoClientResponse(response);
    },

    /**
     * Devuelve la ficha de un registro (`GET /v1/tables/:schema/:table/record`)
     * identificado por su clave: una columna (`{ id: '…' }`) o varias si la
     * clave es compuesta. La respuesta trae la fila (`data`), el metadato de
     * la tabla, los permisos del usuario, las filas a las que apuntan sus
     * claves foráneas legibles (`foreignKeyRecords`) y el metadato de las
     * tablas intermedias legibles (`junctionMetadataMap`, para las M2M).
     *
     * Lanza `ApiError` con `status` 403 si el usuario no puede leer la tabla
     * y 404 si la clave no identifica ninguna fila.
     */
    async getRecord(params: RecordParams) {
      const client = createHonoClient<GetRecordRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][':table'].record.$get({
        param: { schema: params.schema, table: params.table },
        query: params.keys,
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

    /**
     * Devuelve qué puede hacer el usuario con una tabla
     * (`GET /v1/data/:schema/:table/permissions`): `canSelect`, `canInsert`,
     * `canUpdate` y `canDelete`. La interfaz lo usa solo para mostrar u
     * ocultar acciones; la API vuelve a comprobar cada escritura.
     */
    async getTablePermissions(params: { schema: string; table: string }) {
      const client =
        createHonoClient<GetDataRecordPermissionsRoute>(clientOptions);

      const response = await client.v1.data[':schema'][
        ':table'
      ].permissions.$get({ param: params });

      return handleHonoClientResponse(response);
    },

    /**
     * Crea un registro (`POST /v1/tables/:schema/:table/record`) y devuelve la
     * fila creada, con los valores por defecto que puso la base de datos.
     */
    async insertRecord(params: {
      schema: string;
      table: string;
      data: Record<string, unknown>;
    }) {
      const client = createHonoClient<InsertRecordRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][':table'].record.$post(
        {
          param: { schema: params.schema, table: params.table },
          json: params.data,
        },
      );

      return handleHonoClientResponse(response);
    },

    /**
     * Actualiza el registro identificado por `keys` (su clave, de una o
     * varias columnas) con los valores de `data`
     * (`PUT /v1/tables/:schema/:table/record/conditions`).
     */
    async updateRecord(
      params: RecordParams & { data: Record<string, unknown> },
    ) {
      const client =
        createHonoClient<UpdateRecordByConditionsRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][
        ':table'
      ].record.conditions.$put({
        param: { schema: params.schema, table: params.table },
        json: { conditions: params.keys, data: params.data },
      });

      return handleHonoClientResponse(response);
    },

    /**
     * Borra el registro identificado por `keys`
     * (`DELETE /v1/tables/:schema/:table/record/conditions`).
     */
    async deleteRecord(params: RecordParams) {
      const client =
        createHonoClient<DeleteRecordByConditionsRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][
        ':table'
      ].record.conditions.$delete({
        param: { schema: params.schema, table: params.table },
        json: { conditions: params.keys },
      });

      return handleHonoClientResponse(response);
    },

    /**
     * Borra varios registros, cada uno identificado por su clave
     * (`DELETE /v1/tables/:schema/:table/records`). Devuelve cuántos se
     * borraron y cuántos fallaron.
     */
    async batchDeleteRecords(params: {
      schema: string;
      table: string;
      items: Array<Record<string, unknown>>;
    }) {
      const client = createHonoClient<BatchDeleteRecordsRoute>(clientOptions);

      const response = await client.v1.tables[':schema'][
        ':table'
      ].records.$delete({
        param: { schema: params.schema, table: params.table },
        json: { items: params.items },
      });

      return handleHonoClientResponse(response);
    },

    /**
     * Vincula dos registros de una relación muchos a muchos creando la fila
     * de la tabla intermedia. Exige `insert` sobre la tabla intermedia.
     */
    async linkRecords(params: M2MLinkParams) {
      const client = createHonoClient<M2MLinkRoute>(clientOptions);

      const response = await client.v1['data-explorer'][':schema'][
        ':table'
      ].m2m.link.$post({
        param: { schema: params.schema, table: params.table },
        json: {
          sourceId: params.sourceId,
          targetId: params.targetId,
          relation: params.relation,
        },
      });

      return handleHonoClientResponse(response);
    },

    /**
     * Desvincula dos registros borrando la fila de la tabla intermedia. Exige
     * `delete` sobre la tabla intermedia.
     */
    async unlinkRecords(params: M2MLinkParams) {
      const client = createHonoClient<M2MUnlinkRoute>(clientOptions);

      const response = await client.v1['data-explorer'][':schema'][
        ':table'
      ].m2m.unlink.$post({
        param: { schema: params.schema, table: params.table },
        json: {
          sourceId: params.sourceId,
          targetId: params.targetId,
          relation: params.relation,
        },
      });

      return handleHonoClientResponse(response);
    },
  };
}

/**
 * Vínculo muchos a muchos entre el registro de origen (`schema.table`,
 * `sourceId`) y uno de destino (`targetId`) a través de la tabla intermedia
 * descrita en `relation`.
 */
export type M2MLinkParams = {
  schema: string;
  table: string;
  sourceId: string | number;
  targetId: string | number;
  relation: {
    sourceColumn: string;
    targetSchema: string;
    targetTable: string;
    targetColumn: string;
    junctionSchema: string;
    junctionTable: string;
    junctionSourceColumn: string;
    junctionTargetColumn: string;
  };
};

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

/**
 * Registro que se quiere abrir: tabla y valores de su clave, como
 * `{ columna: valor }` (varias entradas si la clave es compuesta).
 */
export type RecordParams = {
  schema: string;
  table: string;
  keys: Record<string, string>;
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

/** Metadato de una tabla (`GET /v1/tables/:schema/:table/metadata`). */
export type CmsTableMetadata = Awaited<ReturnType<CmsApi['getTableMetadata']>>;

/** Ficha de un registro (`GET /v1/tables/:schema/:table/record`). */
export type CmsRecordData = Awaited<ReturnType<CmsApi['getRecord']>>;

/** Permisos del usuario sobre una tabla (`canSelect`, `canInsert`…). */
export type CmsTablePermissions = Awaited<
  ReturnType<CmsApi['getTablePermissions']>
>;

/** Vistas guardadas de una tabla, separadas en personales y de equipo. */
export type CmsSavedViews = Awaited<ReturnType<CmsApi['getSavedViews']>>;

/** Una vista guardada tal como la devuelve la API. */
export type CmsSavedView = CmsSavedViews['personal'][number];

/** Página del listado de usuarios (`GET /v1/users`). */
export type CmsUsersList = Awaited<ReturnType<CmsApi['getUsers']>>;

/** Un usuario del listado. */
export type CmsUserListItem = CmsUsersList['users'][number];

/** Ficha de un usuario (`GET /v1/users/:id`). */
export type CmsUserDetails = Awaited<ReturnType<CmsApi['getUser']>>['data'];

/** Resultado de una acción sobre uno o varios usuarios. */
export type CmsUsersBatchResult = Awaited<ReturnType<CmsApi['banUser']>>;

/** *Bucket* legible (`GET /v1/storage/buckets`). */
export type CmsStorageBucket = Awaited<
  ReturnType<CmsApi['getStorageBuckets']>
>['buckets'][number];

/** Página del contenido de una carpeta del almacenamiento. */
export type CmsBucketContents = Awaited<
  ReturnType<CmsApi['getBucketContents']>
>;

/** Un fichero o carpeta del almacenamiento. */
export type CmsStorageItem = CmsBucketContents['contents'][number];
