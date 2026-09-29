import { inArray, sql } from 'drizzle-orm';
import type { Context } from 'hono';

import {
  FilterBuilder,
  parsePropertiesToFilters,
} from '@pymekit/cms-filters-core';
import type { FilterCondition } from '@pymekit/cms-filters-core';
import {
  type DrizzleSupabaseClient,
  getDrizzleSupabaseAdminClient,
} from '@pymekit/cms-supabase/client';
import { tableMetadataInCms } from '@pymekit/cms-supabase/schema';
import { perfLogger } from '@pymekit/cms-supabase/utils/perf-logger';
import type { ColumnMetadata } from '@pymekit/cms-types';

import {
  type BatchGroup,
  type BatchResult,
  groupForeignKeyLookups,
  mapBatchResultsToRelations,
  processFilterBasedLookups,
} from '../utils/batch-foreign-key-processor';
import {
  buildBatchSelectQuery,
  createDeniedResults,
  extractUniqueTargets,
  filterAllowedGroups,
  validateBatchQueryParams,
} from '../utils/batch-query-builder';
import { buildOptimalColumnList } from '../utils/display-format-parser';
import { getLookupRelations } from '../utils/relations';
import { createTableMetadataService } from './table-metadata-service';
import { createTableQueryService } from './table-query-service';

export type DisplayFormatter = (
  displayFormat: string,
  row: Record<string, unknown>,
) => string | null | undefined;

export type TableViewParams = {
  schemaName: string;
  tableName: string;
  page: number;
  pageSize: number;
  properties?: Record<string, string | number | boolean | string[] | null>;
  search?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: FilterCondition[];
  displayFormatter?: DisplayFormatter;
  /** Skip permission check if already verified upstream (e.g., in route handler). Defaults to false. */
  skipPermissionCheck?: boolean;
};

export function createTableViewService(context: Context) {
  return new TableViewService(context);
}

/**
 * Table view service. This service is used to query table view data with pagination and filtering.
 * It also fetches relations metadata for target tables referenced by this table.
 */
class TableViewService {
  constructor(private readonly context: Context) {}

  /**
   * Query table view data with pagination and filtering
   * @param params - Query parameters
   * @returns Query result
   */
  async queryTableView(params: TableViewParams) {
    const timer = perfLogger.time('queryTableView', {
      schemaName: params.schemaName,
      tableName: params.tableName,
      page: params.page,
      search: !!params.search,
      filters: params.filters?.length || 0,
      properties: Object.keys(params.properties || {}).length,
    });

    // Get services from context
    const authorization = this.context.get('authorization');
    const metadataService = createTableMetadataService();

    const metaTimer = perfLogger.time('metadata_fetch', {
      schemaName: params.schemaName,
      tableName: params.tableName,
    });

    // This call now includes explicit permission checking
    const { table, columns } = await metadataService.getTableMetadata({
      schemaName: params.schemaName,
      tableName: params.tableName,
    });

    metaTimer.end({ columns: columns.length });

    // Fast exit if table missing
    if (!table) {
      throw new Error('Table not found');
    }

    const filters = this.processFilterConditions(
      params.properties,
      columns,
      true,
    );

    // Skip permission check if already verified upstream (e.g., in route handler)
    // This avoids duplicate DB calls when route already called getTableCRUDPermissions
    const permissionPromise = params.skipPermissionCheck
      ? Promise.resolve(true)
      : authorization.hasDataPermission(
          'select',
          params.schemaName,
          params.tableName,
        );

    const [canViewTable, relationsMetadata] = await Promise.all([
      permissionPromise,
      this.fetchRelationsMetadata(table),
    ]);

    // reject if not allowed to view table
    if (!canViewTable) {
      throw new Error('You do not have permission to view this table');
    }

    // Use optimized table query service
    const tableQueryService = createTableQueryService(this.context);
    const selectColumns = columns.map((c) => c.name);

    // Query page data via core table query service (skip permission check since we already verified)
    const queryTimer = perfLogger.time('table_data_query', {
      schemaName: params.schemaName,
      tableName: params.tableName,
      page: params.page,
    });

    const pageResult = await tableQueryService.queryTableData({
      schemaName: params.schemaName,
      tableName: params.tableName,
      page: params.page,
      pageSize: params.pageSize,
      properties: { columns: selectColumns },
      search: params.search,
      sortColumn: params.sortColumn,
      sortDirection: params.sortDirection,
      filters: (params.filters ?? []).concat(filters),
      skipPermissionCheck: true,
    });

    queryTimer.end({
      rowCount: pageResult.data.length,
      totalCount: pageResult.totalCount,
    });

    const data = pageResult.data as Record<string, unknown>[];

    // Optimize relation processing: only do it when there are actual relations AND data to process
    let formattedRelations: Array<{
      column: string;
      original: unknown;
      formatted: string | null | undefined;
      link: string | null | undefined;
    }> = [];

    if (relationsMetadata.length > 0 && data.length > 0) {
      // Process relations when they exist and we have data to process OR filters that might need relations
      const relTimer = perfLogger.time('relations_process', {
        relationCount: relationsMetadata.length,
        dataRows: data.length,
        hasFilters: !!params.properties,
      });

      // we need to verify in bulk if we have permission to view the relations
      const uniqueSchemaTablePairs = new Set<{
        schemaName: string;
        tableName: string;
      }>();

      relationsMetadata.forEach((m: typeof tableMetadataInCms.$inferSelect) => {
        uniqueSchemaTablePairs.add({
          schemaName: m.schemaName,
          tableName: m.tableName,
        });
      });

      const permissionResults = await this.checkBatchPermissions(
        this.context.get('drizzle'),
        Array.from(uniqueSchemaTablePairs).map((m) => ({
          schema: m.schemaName,
          table: m.tableName,
          key: `${m.schemaName}.${m.tableName}`,
        })),
      );

      const allowedRelationsMetadata = relationsMetadata.filter(
        (m: typeof tableMetadataInCms.$inferSelect) =>
          permissionResults.find(
            (p) => p.key === `${m.schemaName}.${m.tableName}`,
          )?.hasPermission,
      );

      // we pass only the allowed relations metadata to the processRelatedRecords function
      formattedRelations = await this.processRelatedRecords(
        table,
        data,
        allowedRelationsMetadata,
        params,
      );

      relTimer.end({ processedRelations: formattedRelations.length });
    }

    const result = {
      table,
      columns,
      relations: formattedRelations,
      data,
      totalCount: pageResult.totalCount,
      pageCount: pageResult.pageCount,
    };

    timer.end({
      dataCount: data.length,
      totalCount: pageResult.totalCount,
      relationCount: formattedRelations.length,
      hasRelations: getLookupRelations(table.relationsConfig).length > 0,
    });

    return result;
  }

  /**
   * Get a record by keys
   * @param params - Query parameters
   * @returns Record
   */
  async getRecordByKeys(params: {
    schemaName: string;
    tableName: string;
    keyValues: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const { schemaName, tableName, keyValues } = params;

    const client = this.context.get('drizzle');

    const result = await client.runTransaction((tx) => {
      return tx.execute(
        sql`SELECT * FROM cms.get_record_by_keys(
          ${schemaName}::text,
          ${tableName}::text,
          ${JSON.stringify(keyValues)}::jsonb
        )`,
      );
    });

    if (!result || result.length === 0) {
      return {};
    }

    return (result[0]?.['get_record_by_keys'] ?? {}) as Record<string, unknown>;
  }

  /**
   * Get multiple records by keys in batch queries
   * @param batchGroups - Grouped batch lookup parameters
   * @param relationsMetadata - Metadata for each relation (optional, for column optimization)
   * @returns Batch results for each group
   */
  async getBatchRecordsByKeys(
    batchGroups: BatchGroup[],
    relationsMetadata?: Array<{
      schemaName: string;
      tableName: string;
      displayFormat?: string;
    }>,
    skipPermissionCheck = false,
  ): Promise<BatchResult[]> {
    if (batchGroups.length === 0) {
      return [];
    }

    const client = this.context.get('drizzle');
    const adminClient = getDrizzleSupabaseAdminClient();

    let allowedGroups: BatchGroup[];
    let permissionsMap: Map<string, boolean>;

    if (skipPermissionCheck) {
      // Skip permission checks - relations already verified at table level
      allowedGroups = batchGroups;
      permissionsMap = new Map(); // Empty map since all are allowed
    } else {
      // Step 1: Extract unique targets and check permissions
      const uniqueTargets = extractUniqueTargets(batchGroups);

      const permissionResults = await this.checkBatchPermissions(
        client,
        uniqueTargets,
      );

      permissionsMap = new Map(
        permissionResults.map((p) => [p.key, p.hasPermission]),
      );

      // Step 2: Filter batch groups to only include allowed tables
      allowedGroups = filterAllowedGroups(batchGroups, permissionsMap);
    }

    // Step 3: Execute batch queries using admin client (bypass RLS)
    const allowedResults = await Promise.all(
      allowedGroups.map((group) =>
        this.executeBatchQuery(adminClient, group, relationsMetadata),
      ),
    );

    // Step 4: Add empty results for denied tables (skip if permissions were bypassed)
    const deniedResults = skipPermissionCheck
      ? []
      : createDeniedResults(batchGroups, permissionsMap);

    return [...allowedResults, ...deniedResults];
  }

  /**
   * Process and validate filter conditions from properties
   */
  private processFilterConditions(
    properties: Record<string, unknown> | undefined,
    columns: ColumnMetadata[],
    skipValidation = false,
  ) {
    if (!properties) {
      return [];
    }

    try {
      // Parse filters using the secure filters-core implementation
      const parsedFilters = parsePropertiesToFilters(properties, columns);

      // Skip expensive validation for large queries to improve performance
      if (skipValidation) {
        return parsedFilters;
      }

      // Create FilterBuilder for additional validation
      const filterBuilder = new FilterBuilder({
        serviceType: 'data-explorer',
        columns,
        escapeStrategy: 'drizzle',
      });

      // Validate each filter condition
      for (const filter of parsedFilters) {
        const validation = filterBuilder.validateFilter(filter);

        if (!validation.isValid) {
          throw new Error(
            `Invalid filter for '${filter.column}': ${validation.errors.join(', ')}`,
          );
        }
      }

      return parsedFilters;
    } catch (error) {
      throw new Error(
        `Filter validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Optimized fetch of relations metadata with deduplication
   * SECURITY NOTE: Safe to use admin client because checkAllTablePermissions validates access
   */
  private async fetchRelationsMetadata(
    table: typeof tableMetadataInCms.$inferSelect,
  ): Promise<(typeof tableMetadataInCms.$inferSelect)[]> {
    const client = getDrizzleSupabaseAdminClient();
    const lookupRelations = getLookupRelations(table.relationsConfig);

    if (lookupRelations.length === 0) {
      return [];
    }

    // Extract unique target tables to avoid duplicate fetches
    const uniqueTargets = new Set<string>();

    lookupRelations.forEach((relation) => {
      uniqueTargets.add(`${relation.target_schema}.${relation.target_table}`);
    });

    if (uniqueTargets.size === 0) {
      return [];
    }

    const targetArray = Array.from(uniqueTargets).map((target) => {
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
   * Process related records and format them for display using batch processing
   */
  private async processRelatedRecords(
    table: typeof tableMetadataInCms.$inferSelect,
    data: Record<string, unknown>[],
    relationsMetadata: (typeof tableMetadataInCms.$inferSelect)[],
    params: TableViewParams,
  ): Promise<
    Array<{
      column: string;
      original: unknown;
      formatted: string | null | undefined;
      link: string | null | undefined;
    }>
  > {
    const relationsConfig = getLookupRelations(table.relationsConfig);

    // Handle empty initial dataset: process filter-based lookups
    if (data.length === 0 && params.properties) {
      const filterLookups = processFilterBasedLookups(
        relationsConfig,
        params.properties,
      );

      if (filterLookups.length > 0) {
        // Group and batch process filter-based lookups
        const filterBatchGroups = groupForeignKeyLookups(
          filterLookups.map((lookup) => lookup.sourceRow),
          relationsConfig,
        );

        const filterBatchResults = await this.getBatchRecordsByKeys(
          filterBatchGroups,
          relationsMetadata.map((m) => ({
            schemaName: m.schemaName,
            tableName: m.tableName,
            displayFormat: m.displayFormat ?? undefined,
          })),
          true,
        );

        return mapBatchResultsToRelations(
          filterBatchResults,
          filterBatchGroups,
          relationsMetadata.map((m) => ({
            schemaName: m.schemaName,
            tableName: m.tableName,
            displayFormat: m.displayFormat ?? undefined,
          })),
          params.displayFormatter,
        );
      }

      return [];
    }

    // Group all foreign key lookups by target table for efficient batching
    const batchGroups = groupForeignKeyLookups(data, relationsConfig);

    if (batchGroups.length === 0) {
      return [];
    }

    // Execute batch queries for all foreign key groups
    const batchResults = await this.getBatchRecordsByKeys(
      batchGroups,
      relationsMetadata.map((m) => ({
        schemaName: m.schemaName,
        tableName: m.tableName,
        displayFormat: m.displayFormat ?? undefined,
      })),
      true, // Skip permission check - relations already filtered
    );

    // Map batch results back to formatted relations
    return mapBatchResultsToRelations(
      batchResults,
      batchGroups,
      relationsMetadata.map((m) => ({
        schemaName: m.schemaName,
        tableName: m.tableName,
        displayFormat: m.displayFormat ?? undefined,
      })),
      params.displayFormatter,
    );
  }

  /**
   * Check permissions for batch targets using single optimized query
   */
  private async checkBatchPermissions(
    client: DrizzleSupabaseClient,
    targets: Array<{ schema: string; table: string; key: string }>,
  ): Promise<Array<{ key: string; hasPermission: boolean }>> {
    if (targets.length === 0) {
      return [];
    }

    try {
      // Single query with UNION ALL for all permission checks
      const permissionQueries = targets.map(
        (target) => sql`
          SELECT 
            ${target.key}::text as target_key,
            cms.has_data_permission('select'::cms.system_action, ${target.schema}::varchar, ${target.table}::varchar) as has_permission
        `,
      );

      const unionQuery = sql`${sql.join(permissionQueries, sql` UNION ALL `)}`;

      const results = await client.runTransaction(async (tx) => {
        return tx.execute(unionQuery);
      });

      // Map results back to the expected format
      return targets.map((target) => {
        const result = results.find((r) => r['target_key'] === target.key);

        return {
          key: target.key,
          hasPermission: (result?.['has_permission'] as boolean) || false,
        };
      });
    } catch (error) {
      console.error('Batch permission check failed:', error);

      // Fallback to deny all permissions on error
      return targets.map((target) => ({
        key: target.key,
        hasPermission: false,
      }));
    }
  }

  /**
   * Execute a single batch query with validation and optimized column selection
   */
  private async executeBatchQuery(
    adminClient: ReturnType<typeof getDrizzleSupabaseAdminClient>,
    group: BatchGroup,
    relationsMetadata?: Array<{
      schemaName: string;
      tableName: string;
      displayFormat?: string;
    }>,
  ): Promise<BatchResult> {
    const { schema, table, column, values } = group;

    if (values.length === 0) {
      return { schema, table, column, records: [] };
    }

    // Validate query parameters
    const validation = validateBatchQueryParams(schema, table, column, values);

    if (!validation.isValid) {
      console.error(
        `Invalid batch query parameters for ${schema}.${table}.${column}:`,
        validation.errors,
      );

      return { schema, table, column, records: [] };
    }

    try {
      // Find the displayFormat for this specific table
      const tableMetadata = relationsMetadata?.find(
        (meta) => meta.schemaName === schema && meta.tableName === table,
      );

      // Build optimal column list based on displayFormat
      const selectColumns = tableMetadata?.displayFormat
        ? buildOptimalColumnList(tableMetadata.displayFormat, column)
        : undefined; // Fall back to SELECT * if no displayFormat

      const query = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
        selectColumns,
      );
      const result = await adminClient.execute(query);

      const perfGain = selectColumns
        ? `Optimized query (${selectColumns.length} cols vs *)`
        : 'Standard query (SELECT *)';

      // Log performance optimization when using selective columns
      if (selectColumns) {
        console.debug(
          `${perfGain} for ${schema}.${table}: ${selectColumns.join(', ')}`,
        );
      }

      return {
        schema,
        table,
        column,
        records: result || [],
      };
    } catch (error) {
      console.error(
        `Batch query failed for ${schema}.${table}.${column}:`,
        error,
      );
      return { schema, table, column, records: [] };
    }
  }
}
