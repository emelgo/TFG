/**
 * Llamadas de la interfaz a Ajustes > Recursos (lado cliente, F2.7c): tablas
 * gestionadas, metadato y columnas de una tabla, secciones de relaciones,
 * distribución de la ficha y sincronización con el catálogo.
 *
 * Igual que el resto de `./api`, usan el cliente RPC tipado de Hono con los
 * tipos de las rutas importados con `import type`. Toda la autorización
 * ocurre en la API (permiso de sistema `table`, esquemas protegidos) y en
 * las políticas RLS de `cms.table_metadata`.
 *
 * [TFG] RF-09 · ADR-011.
 */
import {
  createHonoClient,
  handleHonoClientResponse,
} from '@pymekit/cms-api/client';
import type {
  GetTableMetadataRoute as GetResourceSettingsRoute,
  GetTablesMetadataRoute,
  SaveLayoutRoute,
  SyncManagedTablesRoute,
  UpdateRelationsConfigRoute,
  UpdateTableColumnsConfigRoute,
  UpdateTableMetadataRoute,
  UpdateTablesMetadataRoute,
} from '@pymekit/cms-settings/routes';

type ClientOptions = { fetch?: typeof fetch };

type Json<T> = T extends { json: infer J } ? J : never;

type PutTableArgs = Parameters<
  ReturnType<
    typeof createHonoClient<UpdateTableMetadataRoute>
  >['v1']['tables'][':schema'][':table']['$put']
>[0];

type PutColumnsArgs = Parameters<
  ReturnType<
    typeof createHonoClient<UpdateTableColumnsConfigRoute>
  >['v1']['tables'][':schema'][':table']['columns']['$put']
>[0];

type PutRelationsArgs = Parameters<
  ReturnType<
    typeof createHonoClient<UpdateRelationsConfigRoute>
  >['v1']['settings']['resources'][':schema'][':table']['relations']['$put']
>[0];

type SaveLayoutArgs = Parameters<
  ReturnType<
    typeof createHonoClient<SaveLayoutRoute>
  >['v1']['resources'][':schema'][':table']['layout']['$post']
>[0];

type PutTablesArgs = Parameters<
  ReturnType<
    typeof createHonoClient<UpdateTablesMetadataRoute>
  >['v1']['tables']['$put']
>[0];

/** Cambios del metadato propio de una tabla. */
export type TableMetadataInput = Json<PutTableArgs>;
/** Cambios de presentación de columnas, por nombre de columna. */
export type ColumnsConfigInput = Json<PutColumnsArgs>;
/** Cambios de las secciones de relaciones de la ficha. */
export type RelationsConfigInput = Json<PutRelationsArgs>['updates'];
/** Distribución de la ficha (`null` vuelve a la de por defecto). */
export type RecordLayoutInput = Json<SaveLayoutArgs>['layout'];
/** Visibilidad y orden de varias tablas. */
export type TablesMetadataInput = Json<PutTablesArgs>;

/** Tabla de Ajustes > Recursos (`schema` + `table`). */
export type ResourceRef = { schema: string; table: string };

/** Crea las funciones de acceso a Ajustes > Recursos. */
export function createResourceSettingsApi(clientOptions: ClientOptions) {
  return {
    /** Tablas gestionadas y permisos. Lanza `ApiError` 403 sin `table`. */
    async getResourceSettingsList() {
      const client = createHonoClient<GetTablesMetadataRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.settings.resources.$get(),
      );
    },

    /** Metadato completo de una tabla (403 sin permiso, 404 si no existe). */
    async getResourceSettings(ref: ResourceRef) {
      const client = createHonoClient<GetResourceSettingsRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.settings.resources[':schema'][':table'].$get({
          param: ref,
        }),
      );
    },

    /** Visibilidad y orden de varias tablas (todo o nada). */
    async updateTablesMetadata(data: TablesMetadataInput) {
      const client = createHonoClient<UpdateTablesMetadataRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.tables.$put({ json: data }),
      );
    },

    /** Nombre visible, descripción, formato, visibilidad y orden de una tabla. */
    async updateTableMetadata(ref: ResourceRef, data: TableMetadataInput) {
      const client = createHonoClient<UpdateTableMetadataRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.tables[':schema'][':table'].$put({
          param: ref,
          json: data,
        }),
      );
    },

    /** Cambios de presentación de columnas existentes. */
    async updateColumnsConfig(ref: ResourceRef, data: ColumnsConfigInput) {
      const client =
        createHonoClient<UpdateTableColumnsConfigRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.tables[':schema'][':table'].columns.$put({
          param: ref,
          json: data,
        }),
      );
    },

    /** Activa o etiqueta secciones de relaciones de la ficha. */
    async updateRelationsConfig(
      ref: ResourceRef,
      updates: RelationsConfigInput,
    ) {
      const client =
        createHonoClient<UpdateRelationsConfigRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.settings.resources[':schema'][':table'].relations.$put({
          param: ref,
          json: { updates },
        }),
      );
    },

    /** Guarda (o borra con `null`) la distribución de la ficha. */
    async saveRecordLayout(ref: ResourceRef, layout: RecordLayoutInput) {
      const client = createHonoClient<SaveLayoutRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.resources[':schema'][':table'].layout.$post({
          param: ref,
          json: { layout },
        }),
      );
    },

    /** Sincroniza con el catálogo las tablas de un esquema (o una sola). */
    async syncManagedTables(data: { schema: string; table?: string }) {
      const client = createHonoClient<SyncManagedTablesRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.tables.sync.$post({ json: data }),
      );
    },
  };
}
