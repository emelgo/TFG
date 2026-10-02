import { sql } from 'drizzle-orm';
import type { Context } from 'hono';

import {
  type DrizzleSupabaseClient,
  getDrizzleSupabaseAdminClient,
} from '@pymekit/cms-supabase/client';
import { perfLogger } from '@pymekit/cms-supabase/utils/perf-logger';

import { isProtectedSchema } from '../lib/protected-schemas';
import {
  TOTAL_COUNT_ALIAS,
  TableQueryBuilder,
} from '../lib/table-query-builder';
import type { TableQueryBuilderParams } from '../lib/table-query-builder';
import { buildApproximateCountQuery } from '../utils/count-optimization';

// Re-export the builder params as our service params
export type TableQueryParams = TableQueryBuilderParams;

export type TableQueryResult = {
  data: unknown[];
  totalCount: number;
  pageCount: number;
};

export function createTableQueryService(context: Context) {
  return new TableQueryService(context);
}

/**
 * Service to query table data
 */
class TableQueryService {
  private readonly queryBuilder: TableQueryBuilder;

  constructor(private readonly context: Context) {
    this.queryBuilder = new TableQueryBuilder();
  }

  /**
   * Optimized query table data with smart count strategy and minimal round trips
   * @param params - Query parameters
   * @returns Query result
   */
  async queryTableData(params: TableQueryParams): Promise<TableQueryResult> {
    const {
      pageSize,
      schemaName,
      tableName,
      search,
      filters,
      skipPermissionCheck = false,
    } = params;

    const timer = perfLogger.time('queryTableData', {
      schemaName,
      tableName,
      page: params.page,
      search: !!search,
      filters: filters?.length || 0,
      skipPermissionCheck: !!skipPermissionCheck,
    });

    // Security: never expose Supabase/CMS-managed schemas through generic
    // table reads, regardless of any (possibly wildcard) data permission. This
    // is enforced here — the shared chokepoint that runs every read on the
    // RLS-off admin client — so widget/preview paths cannot reach `auth.*`,
    // `vault.*`, `cms.*`, etc. even though they lack a route-level guard.
    if (isProtectedSchema(schemaName)) {
      timer.end({ error: 'protected_schema' });
      throw new Error('You do not have permission to view this table');
    }

    // Check permissions unless explicitly skipped (when already checked upstream)
    if (!skipPermissionCheck) {
      const permTimer = perfLogger.time('permission_check', {
        schemaName,
        tableName,
      });

      const client = this.context.get('drizzle');

      const hasPermission = await this.checkTablePermission(
        client,
        schemaName,
        tableName,
      );

      permTimer.end({ allowed: hasPermission });

      if (!hasPermission) {
        timer.end({ error: 'permission_denied' });
        throw new Error('You do not have permission to view this table');
      }
    }

    // Use the admin client for all operations
    const adminClient = getDrizzleSupabaseAdminClient();
    const isSimpleQuery = this.isSimpleTableScan(search, filters);

    if (isSimpleQuery) {
      // Smart progressive enhancement for all simple queries
      const result = await this.handleSimpleQuery(
        params,
        adminClient,
        schemaName,
        tableName,
        pageSize,
      );
      timer.end({
        strategy: 'simple',
        totalCount: result.totalCount,
        rowCount: result.data.length,
      });
      return result;
    }

    // Sequential execution: single query with window function (most efficient)
    const queryTimer = perfLogger.time('complex_query_execute', {
      schemaName,
      tableName,
      page: params.page,
    });
    const { query } = this.queryBuilder.buildQuery(params);
    const rows = await adminClient.execute(query.sql);
    queryTimer.end({ rowCount: rows.length });

    const totalCount = this.getTotalCount(rows);
    const pageCount = this.getPageCount(totalCount, pageSize);

    // Remove total_count from the data (if present from window function)
    const cleanedData = this.cleanData(rows);

    const result = {
      data: cleanedData,
      totalCount,
      pageCount,
    };

    timer.end({
      strategy: 'complex',
      totalCount: result.totalCount,
      rowCount: result.data.length,
    });

    return result;
  }

  /**
   * Clean the data by removing the total_count field
   * @param rows - The rows to clean
   * @returns The cleaned rows
   */
  private cleanData(rows: unknown[]) {
    return rows.map((row) => {
      const rowRecord = row as Record<string, unknown>;
      const { [TOTAL_COUNT_ALIAS]: _totalCount, ...cleanRow } = rowRecord;

      return cleanRow;
    });
  }

  /**
   * Get the page count
   * @param totalCount - The total count of rows
   * @param pageSize - The page size
   * @returns The page count
   */
  private getPageCount(totalCount: number, pageSize: number) {
    return Math.ceil(totalCount / pageSize);
  }

  /**
   * Get the total count of rows
   * @param rows - The rows to get the total count of
   * @returns The total count of rows
   */
  private getTotalCount(rows: unknown[]) {
    return rows.length > 0
      ? Number((rows[0] as Record<string, unknown>)[TOTAL_COUNT_ALIAS])
      : 0;
  }

  /**
   * Determines if the query is a simple table scan suitable for approximate counting
   */
  private isSimpleTableScan(search?: string, filters?: unknown[]): boolean {
    return !search && (!filters || filters.length === 0);
  }

  /**
   * Handle simple queries with smart progressive enhancement
   */
  private async handleSimpleQuery(
    params: TableQueryParams,
    adminClient: ReturnType<typeof getDrizzleSupabaseAdminClient>,
    schemaName: string,
    tableName: string,
    pageSize: number,
  ): Promise<TableQueryResult> {
    const { page } = params;

    if (page === 1) {
      // Ultra-fast first page: LIMIT+1 trick to detect pagination needs
      const fastParams = { ...params, skipCount: true, pageSize: pageSize + 1 };
      const { query } = this.queryBuilder.buildQuery(fastParams);

      const firstPageTimer = perfLogger.time('first_page_query', {
        schemaName,
        tableName,
      });

      const rows = await adminClient.execute(query.sql);
      firstPageTimer.end({ rowCount: rows.length });

      const hasMorePages = rows.length > pageSize;
      const actualData = hasMorePages ? rows.slice(0, pageSize) : rows;
      const cleanedData = this.cleanData(actualData);

      if (!hasMorePages) {
        // Small dataset: we know the exact count
        return {
          data: cleanedData,
          totalCount: actualData.length,
          pageCount: 1,
        };
      }

      // Large dataset: we need pagination info
      // Get approximate count in background for pagination UI
      try {
        const countTimer = perfLogger.time('approximate_count', {
          schemaName,
          tableName,
        });

        const countQuery = buildApproximateCountQuery(schemaName, tableName);
        const countResult = await adminClient.execute(countQuery);
        const rawCount = countResult[0]?.[TOTAL_COUNT_ALIAS];

        if (rawCount === null || rawCount === undefined) {
          countTimer.end({ error: 'null_count' });
          throw new Error('Count query returned null/undefined');
        }

        const approximateCount = parseInt((rawCount as string) || '0') || 0;
        countTimer.end({ count: approximateCount });

        return {
          data: cleanedData,
          totalCount: approximateCount,
          pageCount: Math.ceil(approximateCount / pageSize),
        };
      } catch (error) {
        // Fallback: return data with unknown pagination
        console.warn(
          'Approximate count failed, using fallback pagination:',
          error,
        );

        return {
          data: cleanedData,
          totalCount: pageSize * 10, // Rough estimate for pagination
          pageCount: 10, // Show reasonable pagination
        };
      }
    }

    // Subsequent pages: use fast approximate count + data query
    try {
      const parallelTimer = perfLogger.time('parallel_count_data', {
        schemaName,
        tableName,
        page,
      });

      const fastParams = { ...params, skipCount: true };
      const countQuery = buildApproximateCountQuery(schemaName, tableName);
      const { query: dataQuery } = this.queryBuilder.buildQuery(fastParams);

      const [countResult, dataResult] = await Promise.all([
        adminClient.execute(countQuery),
        adminClient.execute(dataQuery.sql),
      ]);

      const totalCount =
        parseInt((countResult[0]?.[TOTAL_COUNT_ALIAS] as string) || '0') || 0;

      const pageCount = this.getPageCount(totalCount, pageSize);
      const cleanedData = this.cleanData(dataResult as unknown[]);

      parallelTimer.end({
        totalCount,
        rowCount: cleanedData.length,
        strategy: 'parallel',
      });

      return {
        data: cleanedData,
        totalCount,
        pageCount,
      };
    } catch (error) {
      console.warn('Simple query optimization failed, falling back:', error);
      // Fall through to regular window function approach
      const { query } = this.queryBuilder.buildQuery(params);
      const rows = await adminClient.execute(query.sql);

      const totalCount = this.getTotalCount(rows);
      const pageCount = this.getPageCount(totalCount, pageSize);
      const cleanedData = this.cleanData(rows);

      return {
        data: cleanedData,
        totalCount,
        pageCount,
      };
    }
  }

  /**
   * Check table permission for current user
   */
  private async checkTablePermission(
    client: DrizzleSupabaseClient,
    schemaName: string,
    tableName: string,
  ): Promise<boolean> {
    try {
      const result = await client.runTransaction(async (tx) => {
        return tx.execute(
          sql`SELECT cms.has_data_permission('select'::cms.system_action, ${schemaName}::varchar, ${tableName}::varchar) AS has_permission`,
        );
      });

      return (result?.[0]?.['has_permission'] as boolean) || false;
    } catch (error) {
      console.error('Permission check failed:', error);
      return false;
    }
  }
}
