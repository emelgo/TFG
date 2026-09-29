import { type SQL, sql } from 'drizzle-orm';

import type { FilterCondition } from '@pymekit/cms-filters-core';
import {
  GroupByBuilder,
  QueryBuilder,
  WhereBuilder,
} from '@pymekit/cms-query-builder';
import type { QueryResult } from '@pymekit/cms-query-builder';

/**
 * Allowlist of valid `DATE_TRUNC` field keywords. `timeAggregation` is
 * interpolated *raw* into the SQL string (it cannot be a bound parameter), so it
 * MUST be validated against this fixed set before it reaches the query — anything
 * outside it is rejected. See `assertAllowedTimeAggregation`.
 */
const ALLOWED_TIME_AGGREGATIONS = new Set([
  'millennium',
  'century',
  'decade',
  'year',
  'quarter',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
  'milliseconds',
  'microseconds',
]);

/**
 * Allowlist of SQL aggregate functions. The aggregation name is interpolated
 * raw into the SELECT list, so it MUST be validated against this fixed set.
 * See `assertAllowedAggregation`.
 */
const ALLOWED_AGGREGATIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);

/**
 * Alias for the window-function row count. Namespaced so it cannot collide with
 * a real user column: the service strips this key from every returned row.
 */
export const TOTAL_COUNT_ALIAS = '__cms_total_count';

export type TableQueryBuilderParams = {
  schemaName: string;
  tableName: string;
  page: number;
  pageSize: number;
  properties?: { columns?: string[] };
  search?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: FilterCondition[];
  // Enhanced params for widget support
  aggregation?: string; // COUNT, SUM, AVG, etc.
  aggregationColumn?: string; // Column to aggregate
  groupBy?: string[]; // Columns to group by
  timeAggregation?: string; // day, week, month, etc.
  xAxis?: string; // For chart widgets
  yAxis?: string; // For chart widgets
  // HAVING support for post-aggregation filtering
  havingFilters?: FilterCondition[]; // Filters applied after aggregation (HAVING clause)
  // Performance optimization: skip permission check if already verified upstream
  skipPermissionCheck?: boolean;
  // Performance optimization: skip count for simple first page queries
  skipCount?: boolean;
};

export type TableQueryBuilderResult = {
  query: QueryResult;
  isAggregated: boolean;
};

/**
 * Builds queries for table data retrieval with support for:
 * - Regular table queries with pagination
 * - Aggregated queries for charts and metrics
 * - Filtering and searching
 * - Sorting and grouping
 */
export class TableQueryBuilder {
  private readonly quoteIdent = (c: string) => `"${c.replace(/"/g, '""')}"`;

  /**
   * Build a complete query for table data retrieval
   */
  buildQuery(params: TableQueryBuilderParams): TableQueryBuilderResult {
    const {
      schemaName,
      tableName,
      page,
      pageSize,
      properties,
      search,
      sortColumn,
      sortDirection,
      filters = [],
      havingFilters = [],
      aggregation,
      aggregationColumn,
      groupBy,
      timeAggregation,
      xAxis,
      yAxis,
      skipCount = false,
    } = params;

    const isAggregated = !!(aggregation || groupBy || timeAggregation);
    // Optimize column selection: use * when no specific columns requested and not aggregated
    const selectColumns =
      !isAggregated && (!properties?.columns || properties.columns.length === 0)
        ? [{ expression: '*' }] // Use * for simple queries to avoid column enumeration overhead
        : this.buildSelectColumns({
            properties,
            aggregation,
            aggregationColumn,
            groupBy,
            timeAggregation,
            xAxis,
            yAxis,
            isAggregated,
          });

    // Build WHERE clause for use in final query
    const whereClause = this.buildWhereClause(
      filters,
      search,
      schemaName,
      tableName,
    );

    // Only include COUNT when needed (performance optimization)
    const finalColumns = skipCount
      ? selectColumns
      : [
          ...selectColumns,
          { expression: 'COUNT(*) OVER()', alias: TOTAL_COUNT_ALIAS },
        ];

    let baseBuilder = QueryBuilder.from(schemaName, tableName).select({
      columns: finalColumns,
    });

    // Add WHERE clause
    if (whereClause) {
      baseBuilder = baseBuilder.where(whereClause);
    }

    // Add GROUP BY for aggregated queries
    if (isAggregated) {
      const groupByClause = this.buildGroupByClause({
        aggregation,
        timeAggregation,
        xAxis,
        groupBy,
      });
      if (groupByClause) {
        baseBuilder = baseBuilder.groupBy(groupByClause);
      }
    }

    // Add HAVING clause for post-aggregation filtering
    if (havingFilters.length > 0 && isAggregated) {
      const havingClause = this.buildHavingClause(havingFilters, selectColumns);
      if (havingClause) {
        baseBuilder = baseBuilder.having(havingClause);
      }
    }

    // Add sorting
    const orderByClause = this.buildOrderByClause({
      sortColumn,
      sortDirection,
      timeAggregation,
      xAxis,
    });
    if (orderByClause.length > 0) {
      baseBuilder = baseBuilder.orderBy(orderByClause);
    }

    // Add pagination
    baseBuilder = baseBuilder.limit(pageSize, (page - 1) * pageSize);

    const optimizedQuery = baseBuilder.build();

    return {
      query: { sql: optimizedQuery.sql, metadata: optimizedQuery.metadata },
      isAggregated,
    };
  }

  /**
   * Build SELECT columns based on query type (regular vs aggregated)
   */
  private buildSelectColumns(params: {
    properties?: { columns?: string[] };
    aggregation?: string;
    aggregationColumn?: string;
    groupBy?: string[];
    timeAggregation?: string;
    xAxis?: string;
    yAxis?: string;
    isAggregated: boolean;
  }): Array<{ expression: string; alias?: string }> {
    const {
      properties,
      aggregation,
      aggregationColumn,
      groupBy,
      timeAggregation,
      xAxis,
      yAxis,
      isAggregated,
    } = params;

    if (isAggregated) {
      return this.buildAggregatedSelectColumns({
        aggregation,
        aggregationColumn,
        groupBy,
        timeAggregation,
        xAxis,
        yAxis,
      });
    }

    // Regular table mode
    if (properties?.columns && properties.columns.length > 0) {
      return properties.columns.map((c) => ({
        expression: this.quoteIdent(c),
      }));
    }

    return [{ expression: '*' }];
  }

  /**
   * Build SELECT columns for aggregated queries (charts/metrics)
   */
  private buildAggregatedSelectColumns(params: {
    aggregation?: string;
    aggregationColumn?: string;
    groupBy?: string[];
    timeAggregation?: string;
    xAxis?: string;
    yAxis?: string;
  }): Array<{ expression: string; alias?: string }> {
    const {
      aggregation,
      aggregationColumn,
      groupBy,
      timeAggregation,
      xAxis,
      yAxis,
    } = params;
    const selectColumns: Array<{ expression: string; alias?: string }> = [];

    // Add grouping columns (including time aggregation)
    if (timeAggregation && xAxis) {
      const timeExpr = this.buildTimeBucketExpression(timeAggregation, xAxis);
      selectColumns.push({ expression: timeExpr, alias: 'time_bucket' });
    } else if (xAxis) {
      selectColumns.push({ expression: this.quoteIdent(xAxis) });
    }

    if (groupBy && groupBy.length > 0) {
      groupBy.forEach((col) => {
        selectColumns.push({ expression: this.quoteIdent(col) });
      });
    }

    // Add aggregation expressions
    if (aggregation && yAxis) {
      const aggExpr = this.buildAggregationExpression(aggregation, yAxis);
      selectColumns.push({ expression: aggExpr, alias: 'value' });
    } else if (aggregation && aggregationColumn) {
      const aggExpr = this.buildAggregationExpression(
        aggregation,
        aggregationColumn,
      );
      selectColumns.push({ expression: aggExpr, alias: 'value' });
    }

    return selectColumns;
  }

  /**
   * Build aggregation expression (COUNT, SUM, AVG, etc.)
   */
  private buildAggregationExpression(
    aggregation: string,
    column: string,
  ): string {
    const aggColumn = column === '*' ? '*' : this.quoteIdent(column);
    let aggType = this.assertAllowedAggregation(aggregation);

    // Only COUNT(*) is valid SQL - all other aggregations with * are invalid
    // Convert SUM(*), AVG(*), MIN(*), MAX(*) to COUNT(*)
    if (column === '*' && aggType !== 'COUNT') {
      aggType = 'COUNT';
    }

    return `${aggType}(${aggColumn})`;
  }

  /**
   * Build a `DATE_TRUNC(<unit>, <column>)` expression with the time unit
   * validated against {@link ALLOWED_TIME_AGGREGATIONS}. The unit is the only
   * field that cannot be bound as a parameter, so it is the single chokepoint
   * for time-bucket SQL injection — all three time-bucket sites route through
   * here.
   */
  private buildTimeBucketExpression(
    timeAggregation: string,
    xAxis: string,
  ): string {
    const unit = this.assertAllowedTimeAggregation(timeAggregation);

    return `DATE_TRUNC('${unit}', ${this.quoteIdent(xAxis)})`;
  }

  /**
   * Validate a time-aggregation unit against the fixed allowlist. Fails closed:
   * any value outside the allowlist throws rather than reaching raw SQL.
   */
  private assertAllowedTimeAggregation(value: string): string {
    const normalized = value.toLowerCase().trim();

    if (!ALLOWED_TIME_AGGREGATIONS.has(normalized)) {
      throw new Error(`Unsupported time aggregation: "${value}"`);
    }

    return normalized;
  }

  /**
   * Validate an aggregation function name against the fixed allowlist. Fails
   * closed: any value outside the allowlist throws rather than reaching raw SQL.
   */
  private assertAllowedAggregation(value: string): string {
    const normalized = value.toUpperCase().trim();

    if (!ALLOWED_AGGREGATIONS.has(normalized)) {
      throw new Error(`Unsupported aggregation function: "${value}"`);
    }

    return normalized;
  }

  /**
   * Build WHERE clause combining filters and free-text search
   */
  private buildWhereClause(
    filters: FilterCondition[],
    search: string | undefined,
    schemaName: string,
    tableName: string,
  ) {
    const conditions: Array<ReturnType<typeof sql>> = [];

    if (filters.length > 0) {
      const whereFromFilters = WhereBuilder.fromFilters(filters);
      if (whereFromFilters) {
        conditions.push(...whereFromFilters.conditions);
      }
    }

    if (search && search.trim() !== '') {
      const tableRef = sql`${sql.identifier(schemaName)}.${sql.identifier(tableName)}`;
      conditions.push(
        sql`CAST(ROW(${tableRef}.*) AS TEXT) ILIKE ${'%' + search + '%'}`,
      );
    }

    if (conditions.length === 0) {
      return null;
    }

    return WhereBuilder.custom(conditions, 'AND');
  }

  /**
   * Build HAVING clause for post-aggregation filtering
   */
  private buildHavingClause(
    havingFilters: FilterCondition[],
    selectColumns: Array<{ expression: string; alias?: string }>,
  ) {
    if (havingFilters.length === 0) {
      return null;
    }

    // PostgreSQL does not resolve SELECT aliases inside HAVING (unlike GROUP BY
    // and ORDER BY), so substitute the underlying aggregate expression rather
    // than emitting `HAVING "value" > $1`.
    const aliasToExpression = new Map(
      selectColumns
        .filter((column) => column.alias)
        .map((column) => [column.alias as string, column.expression]),
    );

    const conditions = havingFilters.map((filter) =>
      this.buildHavingCondition(filter, aliasToExpression),
    );

    return {
      conditions,
      combineWith: 'AND' as const,
    };
  }

  /** HAVING applies to aggregate results, so only scalar comparisons apply. */
  private static readonly HAVING_OPERATORS: Record<string, string> = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  };

  private buildHavingCondition(
    filter: FilterCondition,
    aliasToExpression: Map<string, string>,
  ): SQL {
    const { column, operator, value } = filter as FilterCondition & {
      operator: string;
    };

    const sqlOperator = TableQueryBuilder.HAVING_OPERATORS[operator];

    if (!sqlOperator) {
      throw new Error(
        `Unsupported HAVING operator: "${operator}". Supported: ${Object.keys(
          TableQueryBuilder.HAVING_OPERATORS,
        ).join(', ')}.`,
      );
    }

    const expression = aliasToExpression.get(column);

    if (!expression) {
      throw new Error(
        `HAVING filter references "${column}", which is not an aggregate in this query. Aggregates available: ${
          [...aliasToExpression.keys()].join(', ') || 'none'
        }.`,
      );
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      throw new Error(
        `HAVING filter on "${column}" requires a numeric value, received: ${String(value)}.`,
      );
    }

    // `expression` is builder-generated (allowlisted function name + quoteIdent
    // column), so it carries no caller-controlled text; the value is bound.
    return sql`${sql.raw(expression)} ${sql.raw(sqlOperator)} ${numericValue}`;
  }

  /**
   * Smart filter categorization: automatically detect whether filters should go in WHERE or HAVING
   * This provides backward compatibility for widgets using legacy 'filters' field
   */
  static categorizeFilters(
    filters: FilterCondition[],
    context: {
      isAggregated: boolean;
      aggregationAliases?: string[];
      yAxis?: string;
      aggregation?: string;
    },
  ): { whereFilters: FilterCondition[]; havingFilters: FilterCondition[] } {
    if (!context.isAggregated) {
      // No aggregation = all filters go to WHERE
      return { whereFilters: filters, havingFilters: [] };
    }

    const whereFilters: FilterCondition[] = [];
    const havingFilters: FilterCondition[] = [];

    // Only aliases this query emits count as aggregates. Matching a fixed word
    // list (`total`, `count`, ...) routed ordinary user columns to HAVING, and
    // the query then aborted with `must appear in the GROUP BY clause`.
    const aggregationAliases = context.aggregationAliases || ['value'];

    for (const filter of filters) {
      if (
        this.isAggregationFilter(filter, { aggregationAliases, ...context })
      ) {
        havingFilters.push(filter);
      } else {
        whereFilters.push(filter);
      }
    }

    return { whereFilters, havingFilters };
  }

  /**
   * Detect if a filter references an aggregated column and should use HAVING
   */
  private static isAggregationFilter(
    filter: FilterCondition,
    context: {
      isAggregated: boolean;
      aggregationAliases: string[];
      yAxis?: string;
      aggregation?: string;
    },
  ): boolean {
    if (!context.isAggregated) {
      return false;
    }

    const column = filter.column.toLowerCase();

    // Check if filter column matches common aggregation aliases
    if (
      context.aggregationAliases.some((alias) => column === alias.toLowerCase())
    ) {
      return true;
    }

    // Check if column looks like an aggregation function (e.g., "COUNT(*)", "SUM(sales)")
    if (/^(count|sum|avg|min|max)\s*\(/i.test(column)) {
      return true;
    }

    // Check if column matches the aggregated field pattern
    if (context.yAxis && context.aggregation) {
      // Escape both fragments: `yAxis` is commonly `*`, and an unescaped
      // caller-supplied `aggregation` threw a SyntaxError.
      const escapeRegExp = (value: string) =>
        value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const aggPattern = new RegExp(
        `^${escapeRegExp(context.aggregation)}\\s*\\(.*${escapeRegExp(
          context.yAxis,
        )}.*\\)$`,
        'i',
      );

      if (aggPattern.test(column)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Build GROUP BY clause for aggregated queries
   */
  private buildGroupByClause(params: {
    aggregation?: string;
    timeAggregation?: string;
    xAxis?: string;
    groupBy?: string[];
  }) {
    const { aggregation, timeAggregation, xAxis, groupBy } = params;

    if (!aggregation && !timeAggregation) {
      return null;
    }

    const groupByColumns: string[] = [];

    if (timeAggregation && xAxis) {
      groupByColumns.push(
        this.buildTimeBucketExpression(timeAggregation, xAxis),
      );
    } else if (xAxis) {
      groupByColumns.push(this.quoteIdent(xAxis));
    }

    if (groupBy && groupBy.length > 0) {
      groupBy.forEach((col) => {
        groupByColumns.push(this.quoteIdent(col));
      });
    }

    if (groupByColumns.length === 0) {
      return null;
    }

    return GroupByBuilder.fromColumns(groupByColumns);
  }

  /**
   * Build ORDER BY clause
   */
  private buildOrderByClause(params: {
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
    timeAggregation?: string;
    xAxis?: string;
  }): Array<{ expression: string; direction: 'ASC' | 'DESC' }> {
    const { sortColumn, sortDirection, timeAggregation, xAxis } = params;
    const orderByClauses: Array<{
      expression: string;
      direction: 'ASC' | 'DESC';
    }> = [];

    // For time-aggregated queries, prioritize time-based sorting
    if (timeAggregation && xAxis) {
      const timeExpression = this.buildTimeBucketExpression(
        timeAggregation,
        xAxis,
      );

      if (sortColumn) {
        // Check if sortColumn is trying to sort by time bucket or aggregated value
        const quotedSortColumn = this.quoteIdent(sortColumn);

        if (
          sortColumn === 'time_bucket' ||
          quotedSortColumn === timeExpression
        ) {
          // Sorting by time bucket - apply direction to time expression
          orderByClauses.push({
            expression: timeExpression,
            direction: sortDirection === 'desc' ? 'DESC' : 'ASC',
          });
        } else if (
          sortColumn === 'value' ||
          sortColumn.toLowerCase().includes('count') ||
          sortColumn.toLowerCase().includes('sum') ||
          sortColumn.toLowerCase().includes('avg') ||
          sortColumn.toLowerCase().includes('min') ||
          sortColumn.toLowerCase().includes('max')
        ) {
          // Sorting by aggregated value - add time as primary, aggregation as secondary
          orderByClauses.push(
            {
              expression: timeExpression,
              direction: 'ASC', // Keep time in chronological order
            },
            {
              expression: quotedSortColumn,
              direction: sortDirection === 'desc' ? 'DESC' : 'ASC',
            },
          );
        } else {
          // Unknown sort column in aggregated context - default to time sorting only
          orderByClauses.push({
            expression: timeExpression,
            direction: 'ASC',
          });
        }
      } else {
        // No specific sort column - default to time-based sorting
        orderByClauses.push({
          expression: timeExpression,
          direction: 'ASC',
        });
      }
    } else if (sortColumn) {
      // Non-aggregated queries - use custom sorting
      orderByClauses.push({
        expression: this.quoteIdent(sortColumn),
        direction: sortDirection === 'desc' ? 'DESC' : 'ASC',
      });
    }

    return orderByClauses;
  }
}
