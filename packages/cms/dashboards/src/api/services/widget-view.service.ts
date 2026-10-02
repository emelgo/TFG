import { inArray } from 'drizzle-orm';
import type { Context } from 'hono';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import {
  createTableMetadataService,
  createTableQueryService,
  createTableViewService,
} from '@pymekit/cms-data-explorer-core';
import { getLookupRelations } from '@pymekit/cms-data-explorer-core/utils';
import type { FilterCondition } from '@pymekit/cms-filters-core';
import {
  type RecordDisplayFormatter,
  formatRecord,
} from '@pymekit/cms-formatters';
import { getDrizzleSupabaseAdminClient } from '@pymekit/cms-supabase/client';
import { tableMetadataInCms } from '@pymekit/cms-supabase/schema';
import type { ColumnMetadata } from '@pymekit/cms-types';

export type WidgetViewParams = {
  schemaName: string;
  tableName: string;
  page: number;
  pageSize: number;
  properties?: Record<string, unknown>;
  search?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: FilterCondition[];
  recordDisplayFormatter?: RecordDisplayFormatter;
};

export type WidgetViewResult = {
  table: typeof tableMetadataInCms.$inferSelect;
  columns: ColumnMetadata[];
  relations: Array<{
    column: string;
    original: unknown;
    formatted: string | null | undefined;
    link: string | null | undefined;
  }>;
  data: Record<string, unknown>[];
  totalCount: number;
  pageCount: number;
};

export function createWidgetViewService(context: Context) {
  return new WidgetViewService(context);
}

/**
 * Widget view service. This service is used to query widget data with pagination, filtering, and relation formatting.
 * It's similar to TableViewService but optimized for dashboard widgets.
 */
class WidgetViewService {
  constructor(private readonly context: Context) {}

  /**
   * Query widget data with pagination, filtering, and relation formatting
   * @param params - Query parameters
   * @returns Query result with formatted relations
   */
  async queryWidgetView(params: WidgetViewParams): Promise<WidgetViewResult> {
    const metadataService = createTableMetadataService();
    const tableQueryService = createTableQueryService(this.context);
    const authorizationService = createAuthorizationService(this.context);

    // Get table metadata
    const metadataResponse = metadataService.getTableMetadata({
      schemaName: params.schemaName,
      tableName: params.tableName,
    });

    const authorizationResponse = authorizationService.hasDataPermission(
      'select',
      params.schemaName,
      params.tableName,
    );

    const [metadata, canViewTable] = await Promise.all([
      metadataResponse,
      authorizationResponse,
    ]);

    // Fast exit if table missing
    if (!canViewTable) {
      throw new Error('Table not found');
    }

    const table = metadata.table;
    const columns = metadata.columns;

    // Fetch relations metadata
    const [relationsMetadata, pageResult] = await Promise.all([
      this.fetchRelationsMetadata(metadata.table),
      tableQueryService.queryTableData({
        schemaName: params.schemaName,
        tableName: params.tableName,
        page: params.page,
        pageSize: params.pageSize,
        properties: params.properties,
        search: params.search,
        sortColumn: params.sortColumn,
        sortDirection: params.sortDirection,
        filters: params.filters || [],
      }),
    ]);

    const data = pageResult.data as Record<string, unknown>[];

    // Process related records for display formatting
    const formattedRelations = await this.processRelatedRecords(
      table,
      data,
      relationsMetadata,
      params,
    );

    return {
      table,
      columns,
      relations: formattedRelations,
      data,
      totalCount: pageResult.totalCount,
      pageCount: pageResult.pageCount,
    };
  }

  /**
   * Fetch relations metadata for tables referenced by the current table
   */
  private async fetchRelationsMetadata(
    table: typeof tableMetadataInCms.$inferSelect,
  ): Promise<(typeof tableMetadataInCms.$inferSelect)[]> {
    const client = getDrizzleSupabaseAdminClient();

    const relations = getLookupRelations(table.relationsConfig);
    const relationTargets = relations.map(
      (relation) => `${relation.target_schema}.${relation.target_table}`,
    );

    if (relationTargets.length === 0) {
      return [];
    }

    const targetArray = relationTargets.map((target) => {
      const [schemaName, tableName] = target.split('.');

      return { schemaName, tableName };
    });

    const targetTableNames = targetArray.reduce<string[]>((acc, target) => {
      if (target.tableName) {
        return [...acc, target.tableName];
      }

      return acc;
    }, []);

    return client
      .select()
      .from(tableMetadataInCms)
      .where(inArray(tableMetadataInCms.tableName, targetTableNames))
      .execute()
      .then((results) =>
        results.filter((metadata) =>
          targetArray.some(
            (target) =>
              target.schemaName === metadata.schemaName &&
              target.tableName === metadata.tableName,
          ),
        ),
      );
  }

  /**
   * Process related records and format them for display
   */
  private async processRelatedRecords(
    table: typeof tableMetadataInCms.$inferSelect,
    data: Record<string, unknown>[],
    relationsMetadata: (typeof tableMetadataInCms.$inferSelect)[],
    params: WidgetViewParams,
  ): Promise<
    Array<{
      column: string;
      original: unknown;
      formatted: string | null | undefined;
      link: string | null | undefined;
    }>
  > {
    // Use the table view service to get record by keys
    const tableViewService = createTableViewService(this.context);
    const formattedRelations: Array<{
      column: string;
      original: unknown;
      formatted: string | null | undefined;
      link: string | null | undefined;
    }> = [];

    const relations = getLookupRelations(table.relationsConfig);

    // Process each relation
    const relatedData = await Promise.all(
      relations
        .map(async (relation) => {
          const targetMetadata = relationsMetadata.find(
            (m) =>
              m.tableName === relation.target_table &&
              m.schemaName === relation.target_schema,
          );

          if (!targetMetadata?.displayFormat) {
            return [];
          }

          return data
            .map((row: Record<string, unknown>) => {
              const value = row[relation.source_column];

              if (value === null || value === undefined) {
                return null;
              }

              return {
                table: relation.target_table,
                schema: relation.target_schema,
                column: relation.source_column,
                value,
                target: relation.target_column,
                row,
              };
            })
            .filter(
              (entry): entry is NonNullable<typeof entry> => entry !== null,
            );
        })
        .flat(),
    );

    // Query related records to format using provided display formatter
    await Promise.all(
      (
        relatedData.flat() as Array<{
          table: string;
          schema: string;
          column: string;
          target: string;
          value: unknown;
        }>
      ).map(async (value) => {
        try {
          const displayFormat = relationsMetadata.find(
            (item) =>
              item.tableName === value.table &&
              item.schemaName === value.schema,
          )?.displayFormat;

          if (!displayFormat || value.value == null) {
            return;
          }

          const record = await tableViewService.getRecordByKeys({
            schemaName: value.schema,
            tableName: value.table,
            keyValues: { [value.target]: value.value },
          });

          const formatted = (params.recordDisplayFormatter || formatRecord)(
            displayFormat,
            record || {},
          );

          formattedRelations.push({
            column: value.column,
            original: value.value,
            formatted,
            link: `/${value.schema}/${value.table}/record/${value.value}`,
          });
        } catch (_error) {
          // Silently handle errors for individual relations
          console.error('Error processing relation:', _error);
        }
      }),
    );

    return formattedRelations;
  }
}
