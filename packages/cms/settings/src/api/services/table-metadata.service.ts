/**
 * Servicio de Ajustes > Recursos del CMS (F2.7c): metadato de las tablas
 * gestionadas (`cms.table_metadata`), configuración de columnas y
 * relaciones, distribución de la ficha y sincronización con el catálogo.
 *
 * Seguridad (cambios respecto al código de partida):
 *
 *  - **Permiso explícito.** Toda operación comprueba antes el permiso de
 *    sistema `table` (`select` o `update` para leer, `update` para escribir)
 *    con `cms.has_admin_permission` dentro de la transacción del usuario. La
 *    política RLS `update_table_metadata` lo vuelve a exigir, pero un
 *    `UPDATE` rechazado por RLS no falla, solo no cambia filas: sin esta
 *    comprobación la API respondía «éxito» sin hacer nada.
 *  - **Esquemas protegidos.** Ni se listan, ni se configuran ni se
 *    sincronizan tablas de `auth`, `vault`, `cms`, `storage`, `pg_*`…
 *    (`isProtectedSchema`, la misma lista que `cms.validate_schema_access`).
 *  - **Solo presentación.** Las columnas se fusionan campo a campo
 *    (`mergeColumnsConfig`) en lugar de reemplazarse, y solo las que ya
 *    existen; la distribución solo puede usar columnas de la tabla.
 *  - **Errores estables.** Los fallos se lanzan como `SettingsError`
 *    (`SETTINGS_*`); la ruta nunca devuelve el texto de PostgreSQL.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { isProtectedSchema } from '@pymekit/cms-data-explorer-core/protected-schemas';
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import {
  type DrizzleSupabaseClient,
  getDrizzleSupabaseAdminClient,
} from '@pymekit/cms-supabase/client';
import { tableMetadataInCms } from '@pymekit/cms-supabase/schema';
import type {
  ColumnsConfig,
  InlineRelationConfig,
  RelationConfig,
  TableUiConfig,
} from '@pymekit/cms-types';

import {
  type SaveLayoutSchemaType,
  type TableMetadataSchemaType,
  type UpdateTableColumnsConfigSchemaType,
  type UpdateTablesMetadataSchemaType,
  getLayoutFieldNames,
  mergeColumnsConfig,
} from '../schemas';
import { SettingsError } from '../utils/settings-errors';

/** Transacción de Drizzle con los *claims* del usuario. */
type Tx = Parameters<Parameters<DrizzleSupabaseClient['runTransaction']>[0]>[0];

/** Crea el servicio con el contexto de la petición. */
export function createTableMetadataService(c: Context) {
  return new TableMetadataService(c);
}

/** Lanza 403 si el esquema es protegido. */
export function assertManageableSchema(schema: string) {
  if (isProtectedSchema(schema)) {
    throw new SettingsError(
      CMS_API_ERROR_CODES.SETTINGS_RESOURCE_PROTECTED_SCHEMA,
      `Protected schema: ${schema}`,
    );
  }
}

function notFound(schema: string, table: string) {
  return new SettingsError(
    CMS_API_ERROR_CODES.SETTINGS_RESOURCE_NOT_FOUND,
    `Table metadata not found: ${schema}.${table}`,
  );
}

function byTable(schema: string, table: string) {
  return and(
    eq(tableMetadataInCms.schemaName, schema),
    eq(tableMetadataInCms.tableName, table),
  );
}

class TableMetadataService {
  constructor(private readonly context: Context) {}

  /** Lo que el usuario puede hacer en Ajustes > Recursos. */
  async getPermissions() {
    const client = this.context.get('drizzle');

    return client.runTransaction((tx: Tx) => this.readPermissions(tx));
  }

  /** Tablas gestionadas (sin las de esquemas protegidos) y permisos. */
  async getTables() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx: Tx) => {
      const permissions = await this.requirePermission(tx, 'read');

      const rows = await tx
        .select({
          schemaName: tableMetadataInCms.schemaName,
          tableName: tableMetadataInCms.tableName,
          displayName: tableMetadataInCms.displayName,
          description: tableMetadataInCms.description,
          isVisible: tableMetadataInCms.isVisible,
          isSearchable: tableMetadataInCms.isSearchable,
          ordering: tableMetadataInCms.ordering,
          navigationGroup: sql<
            string | null
          >`${tableMetadataInCms.uiConfig} ->> 'navigation_group'`,
        })
        .from(tableMetadataInCms);

      const tables = rows.filter((row) => !isProtectedSchema(row.schemaName));

      return { tables, permissions };
    });
  }

  /** Metadato completo de una tabla. */
  async getTableMetadata(params: { schema: string; table: string }) {
    assertManageableSchema(params.schema);

    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx: Tx) => {
      const permissions = await this.requirePermission(tx, 'read');

      const [row] = await tx
        .select()
        .from(tableMetadataInCms)
        .where(byTable(params.schema, params.table))
        .limit(1);

      if (!row) {
        throw notFound(params.schema, params.table);
      }

      const data = row as typeof row & {
        columnsConfig: ColumnsConfig;
        relationsConfig: RelationConfig[];
        uiConfig: TableUiConfig;
      };

      return { data, permissions };
    });
  }

  /** Cambia el metadato propio de una tabla. */
  async updateTableMetadata(params: {
    schema: string;
    table: string;
    data: TableMetadataSchemaType;
  }) {
    assertManageableSchema(params.schema);

    const { data } = params;
    const payload: Partial<typeof tableMetadataInCms.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.display_name !== undefined)
      payload.displayName = data.display_name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.display_format !== undefined) {
      payload.displayFormat = data.display_format;
    }
    if (data.is_visible !== undefined) payload.isVisible = data.is_visible;
    if (data.is_searchable !== undefined) {
      payload.isSearchable = data.is_searchable;
    }
    if (data.ordering !== undefined) payload.ordering = data.ordering;

    // El área vive dentro de `ui_config` (sin columna propia). Se fusiona en
    // la propia sentencia con operadores `jsonb`, sin leer antes la fila: así
    // no se pisa un cambio concurrente de otra clave (`recordLayout`). El
    // valor viaja como parámetro enlazado, nunca interpolado en el SQL.
    if (data.navigation_group !== undefined) {
      const current = sql`coalesce(${tableMetadataInCms.uiConfig}, '{}'::jsonb)`;

      payload.uiConfig =
        data.navigation_group === null
          ? sql`${current} - 'navigation_group'`
          : sql`${current} || jsonb_build_object('navigation_group', ${data.navigation_group}::text)`;
    }

    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx: Tx) => {
      await this.requirePermission(tx, 'update');

      const rows = await tx
        .update(tableMetadataInCms)
        .set(payload)
        .where(byTable(params.schema, params.table))
        .returning({ schemaName: tableMetadataInCms.schemaName });

      if (rows.length === 0) {
        throw notFound(params.schema, params.table);
      }

      return rows;
    });
  }

  /**
   * Visibilidad y orden de varias tablas. Es todo o nada: si alguna no
   * existe (o el usuario no la ve) se deshace la transacción.
   */
  async updateTablesMetadata(resources: UpdateTablesMetadataSchemaType) {
    for (const resource of resources) {
      assertManageableSchema(resource.schema);
    }

    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx: Tx) => {
      await this.requirePermission(tx, 'update');

      let updated = 0;

      // En serie: una transacción de Postgres no admite consultas en
      // paralelo por la misma conexión.
      for (const resource of resources) {
        const payload: Partial<typeof tableMetadataInCms.$inferInsert> = {
          updatedAt: new Date().toISOString(),
        };

        if (resource.isVisible !== undefined) {
          payload.isVisible = resource.isVisible;
        }

        if (resource.ordering !== undefined) {
          payload.ordering = resource.ordering;
        }

        const rows = await tx
          .update(tableMetadataInCms)
          .set(payload)
          .where(byTable(resource.schema, resource.table))
          .returning({ tableName: tableMetadataInCms.tableName });

        if (rows.length === 0) {
          throw notFound(resource.schema, resource.table);
        }

        updated += rows.length;
      }

      return { updated };
    });
  }

  /** Aplica cambios de presentación a columnas existentes. */
  async updateTableColumnsConfig(params: {
    schema: string;
    table: string;
    data: UpdateTableColumnsConfigSchemaType;
  }) {
    assertManageableSchema(params.schema);

    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx: Tx) => {
      await this.requirePermission(tx, 'update');

      const [current] = await tx
        .select({ columnsConfig: tableMetadataInCms.columnsConfig })
        .from(tableMetadataInCms)
        .where(byTable(params.schema, params.table))
        .limit(1);

      if (!current) {
        throw notFound(params.schema, params.table);
      }

      const merged = mergeColumnsConfig(
        (current.columnsConfig ?? {}) as Record<
          string,
          Record<string, unknown>
        >,
        params.data,
      );

      if (!merged) {
        throw new SettingsError(
          CMS_API_ERROR_CODES.SETTINGS_INVALID_DATA,
          'Unknown column in columns config update',
        );
      }

      await tx
        .update(tableMetadataInCms)
        .set({ columnsConfig: merged, updatedAt: new Date().toISOString() })
        .where(byTable(params.schema, params.table));

      return { columns: Object.keys(params.data) };
    });
  }

  /**
   * Sincroniza el metadato de un esquema (o de una tabla) con el catálogo
   * de PostgreSQL. `cms.sync_managed_tables` solo la puede ejecutar el rol
   * de servicio (lee `information_schema` de cualquier esquema), así que se
   * usa el cliente administrador, pero **solo después** de comprobar el
   * permiso `table:update` del usuario y que el esquema no sea protegido.
   * (La función SQL no los rechaza por sí misma: el *seed* la usa con el rol
   * `postgres` para registrar `auth.users` para el explorador de usuarios.)
   */
  async syncManagedTables(params: { schema: string; table?: string }) {
    assertManageableSchema(params.schema);

    const client = this.context.get('drizzle');

    await client.runTransaction((tx: Tx) =>
      this.requirePermission(tx, 'update'),
    );

    const adminClient = getDrizzleSupabaseAdminClient();

    if (params.table) {
      await adminClient.execute(
        sql`select cms.sync_managed_tables(${params.schema}, ${params.table})`,
      );
    } else {
      await adminClient.execute(
        sql`select cms.sync_managed_tables(${params.schema})`,
      );
    }

    return { schema: params.schema, table: params.table ?? null };
  }

  /** Guarda (o borra, con `null`) la distribución de la ficha. */
  async saveLayout(params: {
    schema: string;
    table: string;
    layout: SaveLayoutSchemaType['layout'];
  }) {
    assertManageableSchema(params.schema);

    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx: Tx) => {
      await this.requirePermission(tx, 'update');

      const [current] = await tx
        .select({
          uiConfig: tableMetadataInCms.uiConfig,
          columnsConfig: tableMetadataInCms.columnsConfig,
        })
        .from(tableMetadataInCms)
        .where(byTable(params.schema, params.table))
        .limit(1);

      if (!current) {
        throw notFound(params.schema, params.table);
      }

      const columns = new Set(
        Object.keys((current.columnsConfig ?? {}) as Record<string, unknown>),
      );

      for (const field of getLayoutFieldNames(params.layout)) {
        if (!columns.has(field)) {
          throw new SettingsError(
            CMS_API_ERROR_CODES.SETTINGS_INVALID_DATA,
            'Layout references an unknown column',
          );
        }
      }

      const uiConfig = {
        ...((current.uiConfig ?? {}) as Record<string, unknown>),
        recordLayout: params.layout,
      };

      await tx
        .update(tableMetadataInCms)
        .set({ uiConfig, updatedAt: new Date().toISOString() })
        .where(byTable(params.schema, params.table));

      return { saved: params.layout !== null };
    });
  }

  /**
   * Activa o etiqueta secciones de relaciones existentes
   * (`relations_config[].inline_config`), conservando el resto de campos.
   */
  async updateRelationsConfig(params: {
    schema: string;
    table: string;
    updates: Array<{
      source_column: string;
      target_schema: string;
      target_table: string;
      target_column: string;
      inline_config: InlineRelationConfig;
    }>;
  }) {
    assertManageableSchema(params.schema);

    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx: Tx) => {
      await this.requirePermission(tx, 'update');

      const [current] = await tx
        .select({ relationsConfig: tableMetadataInCms.relationsConfig })
        .from(tableMetadataInCms)
        .where(byTable(params.schema, params.table))
        .limit(1);

      if (!current) {
        throw notFound(params.schema, params.table);
      }

      const relations = (current.relationsConfig ?? []) as RelationConfig[];
      let matchedCount = 0;

      const updated = relations.map((relation) => {
        const update = params.updates.find(
          (u) =>
            u.source_column === relation.source_column &&
            u.target_schema === relation.target_schema &&
            u.target_table === relation.target_table &&
            u.target_column === relation.target_column,
        );

        if (!update) {
          return relation;
        }

        matchedCount += 1;

        return {
          ...relation,
          inline_config: { ...relation.inline_config, ...update.inline_config },
        };
      });

      if (matchedCount !== params.updates.length) {
        throw new SettingsError(
          CMS_API_ERROR_CODES.SETTINGS_INVALID_DATA,
          'Relations update does not match the table relations',
        );
      }

      await tx
        .update(tableMetadataInCms)
        .set({ relationsConfig: updated, updatedAt: new Date().toISOString() })
        .where(byTable(params.schema, params.table));

      return { matchedCount };
    });
  }

  private async readPermissions(tx: Tx) {
    const rows = await tx.execute(
      sql`select
            cms.has_admin_permission('table'::cms.system_resource, 'select'::cms.system_action) as can_select,
            cms.has_admin_permission('table'::cms.system_resource, 'update'::cms.system_action) as can_update`,
    );

    const row = rows[0] as
      | { can_select?: boolean | null; can_update?: boolean | null }
      | undefined;

    const canUpdate = row?.can_update === true;

    return { canRead: canUpdate || row?.can_select === true, canUpdate };
  }

  /** Exige el permiso de sistema `table` para leer o para escribir. */
  private async requirePermission(tx: Tx, need: 'read' | 'update') {
    const permissions = await this.readPermissions(tx);

    const allowed =
      need === 'read' ? permissions.canRead : permissions.canUpdate;

    if (!allowed) {
      throw new SettingsError(
        CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED,
        `Missing table:${need === 'read' ? 'select' : 'update'} permission`,
      );
    }

    return permissions;
  }
}
