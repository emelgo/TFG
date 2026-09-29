import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { z } from 'zod';

import { getDrizzleSupabaseAdminClient } from '@pymekit/cms-supabase/client';
import { tableMetadataInCms } from '@pymekit/cms-supabase/schema';
import type {
  ColumnsConfig,
  RecordLayoutConfig,
  RelationConfig,
  TableUiConfig,
} from '@pymekit/cms-types';
import type { InlineRelationConfig } from '@pymekit/cms-types';

import {
  type TableMetadataSchemaType,
  UpdateTableColumnsConfigSchema,
  type UpdateTablesMetadataSchemaType,
} from '../schemas';

/**
 * Creates a ResourcesService instance.
 * @param c
 */
export function createTableMetadataService(c: Context) {
  return new TableMetadataService(c);
}

/**
 * @name TableMetadataService
 * @description Service for managing table metadata
 */
class TableMetadataService {
  constructor(private readonly context: Context) {}

  /**
   * Update the columns config for a table
   * @param params - The parameters for the update
   * @param params.table - The table name
   * @param params.schema - The schema name
   * @param params.data - The data to update
   * @returns The updated columns config
   */
  async updateTableColumnsConfig(params: {
    table: string;
    schema: string;
    data: z.infer<typeof UpdateTableColumnsConfigSchema>;
  }) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .update(tableMetadataInCms)
        .set({
          columnsConfig: sql`${tableMetadataInCms.columnsConfig} || ${JSON.stringify(params.data)}`,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(tableMetadataInCms.tableName, params.table),
            eq(tableMetadataInCms.schemaName, params.schema),
          ),
        )
        .returning();
    });
  }

  /**
   * Update the metadata for a table
   * @param params - The parameters for the update
   * @param params.table - The table name
   * @param params.schema - The schema name
   * @param params.data - The data to update
   * @returns The updated metadata
   */
  async updateTableMetadata(params: {
    table: string;
    schema: string;
    data: TableMetadataSchemaType;
  }) {
    const client = this.context.get('drizzle');

    const payload: Partial<typeof tableMetadataInCms.$inferInsert> = {};

    if (params.data.is_visible !== undefined) {
      payload.isVisible = params.data.is_visible;
    }

    if (params.data.is_searchable !== undefined) {
      payload.isSearchable = params.data.is_searchable;
    }

    if (params.data.display_name !== undefined) {
      payload.displayName = params.data.display_name;
    }

    if (params.data.description !== undefined) {
      payload.description = params.data.description;
    }

    if (params.data.display_format) {
      payload.displayFormat = params.data.display_format;
    }

    if (params.data.ordering !== undefined) {
      payload.ordering = params.data.ordering;
    }

    return client.runTransaction(async (tx) => {
      return tx
        .update(tableMetadataInCms)
        .set({
          ...payload,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(tableMetadataInCms.tableName, params.table),
            eq(tableMetadataInCms.schemaName, params.schema),
          ),
        )
        .returning();
    });
  }

  /**
   * Update the metadata for a table
   * @param resources - The resources to update
   * @returns The updated metadata
   */
  async updateTablesMetadata(resources: UpdateTablesMetadataSchemaType) {
    const client = this.context.get('drizzle');

    // Update each resource in the database
    return client.runTransaction(async (tx) => {
      const commands = resources.map((resource) => {
        const payload: Partial<typeof tableMetadataInCms.$inferInsert> = {
          updatedAt: new Date().toISOString(),
        };

        if (resource.isVisible !== undefined) {
          payload.isVisible = resource.isVisible;
        }

        if (resource.ordering !== undefined) {
          payload.ordering = resource.ordering;
        }

        return tx
          .update(tableMetadataInCms)
          .set(payload)
          .where(
            and(
              eq(tableMetadataInCms.tableName, resource.table),
              eq(tableMetadataInCms.schemaName, resource.schema),
            ),
          )
          .returning();
      });

      return await Promise.all(commands);
    });
  }

  /**
   * Handler for GET /api/tables
   * Returns a list of all tables that the user has permission to see
   * @returns The tables
   */
  async getTables() {
    const client = this.context.get('drizzle');

    return client.runTransaction((tx) => {
      return tx
        .select({
          schemaName: tableMetadataInCms.schemaName,
          tableName: tableMetadataInCms.tableName,
          displayName: tableMetadataInCms.displayName,
          isVisible: tableMetadataInCms.isVisible,
          ordering: tableMetadataInCms.ordering,
        })
        .from(tableMetadataInCms);
    });
  }

  /**
   * Handler for GET /api/tables/:schema/:table
   * Returns columns and table data for a table
   *
   * @param params - The parameters for the query
   * @param params.schema - The schema name
   * @param params.table - The table name
   * @returns The table and columns
   *
   * @example
   * ```ts
   * const { table, columns } = await getTableMetadata({ schema: 'public', table: 'users' });
   * ```
   */
  async getTableMetadata(params: { schema: string; table: string }) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select()
        .from(tableMetadataInCms)
        .where(
          and(
            eq(tableMetadataInCms.schemaName, params.schema),
            eq(tableMetadataInCms.tableName, params.table),
          ),
        )
        .limit(1)
        .then((data) => {
          const table = data[0];

          if (!table) {
            throw new Error(`Table ${params.table} not found`);
          }

          return table as typeof tableMetadataInCms.$inferSelect & {
            columnsConfig: ColumnsConfig;
            relations: RelationConfig[];
            uiConfig: TableUiConfig;
          };
        });
    });
  }

  /**
   * Sync managed tables metadata by invoking the database function.
   * @param params - Optional schema and table to sync
   * @returns The updated tables metadata
   */
  async syncManagedTables(params: {
    schema: string;
    table: string | undefined;
  }) {
    const client = this.context.get('drizzle');
    const adminClient = getDrizzleSupabaseAdminClient();

    return client.runTransaction(async (tx) => {
      // check permissions using the authed client
      const hasPermission = await tx
        .execute(
          sql`select cms.has_admin_permission (
          'table'::cms.system_resource,
          'update'::cms.system_action
          )`,
        )
        .then((data) => {
          return (data[0]?.['has_admin_permission'] as boolean) ?? false;
        });

      // if the user does not have permission, throw an error
      if (!hasPermission) {
        throw new Error('You do not have permission to sync managed tables');
      }

      if (params.table) {
        // invoke the database function using the admin client (service role)
        return adminClient.execute(
          sql`select cms.sync_managed_tables(${params?.schema}, ${params?.table})`,
        );
      } else {
        // invoke the database function using the admin client (service role)
        return adminClient.execute(
          sql`select cms.sync_managed_tables(${params?.schema})`,
        );
      }
    });
  }

  /**
   * Save layout configuration for a table
   * @param params - The parameters for saving the layout
   * @param params.schema - The schema name
   * @param params.table - The table name
   * @param params.layout - The layout configuration
   * @returns The updated ui config
   */
  async saveLayout(params: {
    schema: string;
    table: string;
    layout: RecordLayoutConfig | null | undefined;
  }) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // First get the current uiConfig
      const current = await tx
        .select({ uiConfig: tableMetadataInCms.uiConfig })
        .from(tableMetadataInCms)
        .where(
          and(
            eq(tableMetadataInCms.tableName, params.table),
            eq(tableMetadataInCms.schemaName, params.schema),
          ),
        )
        .limit(1);

      const currentConfig = current[0]?.uiConfig || {};

      // Update the uiConfig with the new layout
      const updatedConfig = {
        ...currentConfig,
        recordLayout: params.layout || null,
      };

      return tx
        .update(tableMetadataInCms)
        .set({
          uiConfig: updatedConfig,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(tableMetadataInCms.tableName, params.table),
            eq(tableMetadataInCms.schemaName, params.schema),
          ),
        )
        .returning();
    });
  }

  async getPermissions(): Promise<{
    canUpdate: boolean;
  }> {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .execute(
          sql`select cms.has_admin_permission (
      'table'::cms.system_resource,
      'update'::cms.system_action
      )`,
        )
        .then((data) => {
          return {
            canUpdate: (data[0]?.['has_admin_permission'] as boolean) ?? false,
          };
        });
    });
  }

  /**
   * Update inline_config for specific relations in relations_config.
   * Merges inline_config into existing relations without replacing other fields.
   *
   * @param params - The parameters for the update
   * @param params.schema - The schema name
   * @param params.table - The table name
   * @param params.updates - Array of relation updates with inline_config
   * @returns The updated table metadata
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
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // 1. Get current relations_config
      const current = await tx
        .select({ relationsConfig: tableMetadataInCms.relationsConfig })
        .from(tableMetadataInCms)
        .where(
          and(
            eq(tableMetadataInCms.schemaName, params.schema),
            eq(tableMetadataInCms.tableName, params.table),
          ),
        )
        .limit(1);

      const currentRelations = (current[0]?.relationsConfig ??
        []) as RelationConfig[];

      // 2. Merge inline_config updates into matching relations
      let matchedCount = 0;
      const updatedRelations = currentRelations.map((relation) => {
        const update = params.updates.find(
          (u) =>
            u.source_column === relation.source_column &&
            u.target_schema === relation.target_schema &&
            u.target_table === relation.target_table &&
            u.target_column === relation.target_column,
        );

        if (update) {
          matchedCount += 1;
          // Merge inline_config to preserve existing fields (e.g., permissions, max_visible_rows)
          return {
            ...relation,
            inline_config: {
              ...relation.inline_config,
              ...update.inline_config,
            },
          };
        }

        return relation;
      });

      if (matchedCount === 0) {
        return { matchedCount, data: [] };
      }

      // 3. Update relations_config
      const data = await tx
        .update(tableMetadataInCms)
        .set({
          relationsConfig: updatedRelations,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(tableMetadataInCms.tableName, params.table),
            eq(tableMetadataInCms.schemaName, params.schema),
          ),
        )
        .returning();

      return { matchedCount, data };
    });
  }
}
