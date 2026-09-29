import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { FilterCondition } from '@pymekit/cms-filters-core';

import { TableQueryBuilder } from './table-query-builder';
import type { TableQueryBuilderParams } from './table-query-builder';

const pgDialect = new PgDialect();

/**
 * Convert a Drizzle SQL object to string and params for testing
 */
function sqlToString(sqlObject: SQL): {
  sql: string;
  params: unknown[];
} {
  return pgDialect.sqlToQuery(sqlObject);
}

describe('TableQueryBuilder', () => {
  const builder = new TableQueryBuilder();

  const baseParams: TableQueryBuilderParams = {
    schemaName: 'public',
    tableName: 'users',
    page: 1,
    pageSize: 10,
  };

  describe('Regular table queries', () => {
    it('should build basic query with default columns', () => {
      const result = builder.buildQuery(baseParams);

      expect(result.isAggregated).toBe(false);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      // New simplified query structure without CTEs
      expect(sqlStr).toContain('COUNT(*) OVER() AS "__cms_total_count"');
      expect(sqlStr).toContain('SELECT');
      expect(sqlStr).toContain('*');
      expect(sqlStr).toContain('public');
      expect(sqlStr).toContain('users');
      expect(sqlStr).toContain('LIMIT');
      expect(sqlStr).toContain('__cms_total_count');
      // OFFSET is only included when offset > 0 (page > 1)
    });

    it('should build query with specific columns', () => {
      const params = {
        ...baseParams,
        properties: { columns: ['id', 'name', 'email'] },
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(false);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('"id"');
      expect(sqlStr).toContain('"name"');
      expect(sqlStr).toContain('"email"');
    });

    it('should handle pagination correctly', () => {
      const params = {
        ...baseParams,
        page: 3,
        pageSize: 25,
      };

      const result = builder.buildQuery(params);

      // Page 3 with pageSize 25 should have offset of 50
      const { sql: sqlStr, params: sqlParams } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('LIMIT');
      expect(sqlParams).toContain(25); // limit
      expect(sqlParams).toContain(50); // offset
    });

    it('should correctly calculate total count using window function', () => {
      const params = {
        ...baseParams,
        page: 2,
        pageSize: 25,
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);

      // Should use window function approach for simpler and faster counting
      expect(sqlStr).toContain('COUNT(*) OVER() AS "__cms_total_count"');

      // Should have pagination in the main query
      expect(sqlStr).toContain('LIMIT');
      expect(sqlStr).toContain('OFFSET');
    });

    it('should build correct query with filters and pagination', () => {
      const params = {
        ...baseParams,
        page: 1,
        pageSize: 10,
        search: 'test search',
        filters: [
          {
            column: 'status',
            operator: 'eq',
            value: 'active',
            type: 'text',
          },
        ],
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);

      // Should use simplified query structure with window function
      expect(sqlStr).toContain('COUNT(*) OVER() AS "__cms_total_count"');
      expect(sqlStr).toContain('WHERE'); // Should have filters

      // Should have pagination
      expect(sqlStr).toContain('LIMIT');
    });

    it('should handle sorting', () => {
      const params = {
        ...baseParams,
        sortColumn: 'created_at',
        sortDirection: 'desc' as const,
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('ORDER BY');
      expect(sqlStr).toContain('"created_at"');
      expect(sqlStr).toContain('DESC');
    });

    it('should handle free-text search', () => {
      const params = {
        ...baseParams,
        search: 'john doe',
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr, params: sqlParams } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('ILIKE');
      expect(sqlParams).toContain('%john doe%');
    });

    it('should handle filters', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
          type: 'text',
        },
        {
          column: 'age',
          operator: 'gt',
          value: '18',
          type: 'number',
        },
      ];

      const params = {
        ...baseParams,
        filters,
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('WHERE');
    });

    it('should combine search and filters with AND', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
          type: 'text',
        },
      ];

      const params = {
        ...baseParams,
        search: 'test',
        filters,
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('WHERE');
      expect(sqlStr).toContain('AND');
    });
  });

  describe('Aggregated queries', () => {
    it('should build COUNT aggregation query', () => {
      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        yAxis: '*',
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('COUNT(*)');
    });

    it('should build SUM aggregation query', () => {
      const params = {
        ...baseParams,
        aggregation: 'SUM',
        yAxis: 'amount',
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('SUM("amount")');
    });

    it('should convert SUM(*) to COUNT(*)', () => {
      const params = {
        ...baseParams,
        aggregation: 'SUM',
        yAxis: '*',
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('COUNT(*)');
      expect(sqlStr).not.toContain('SUM(*)');
    });

    it('should handle AVG aggregation', () => {
      const params = {
        ...baseParams,
        aggregation: 'AVG',
        yAxis: 'rating',
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('AVG("rating")');
    });

    it('should convert all invalid * aggregations (AVG, MIN, MAX) to COUNT(*)', () => {
      const invalidAggregations = ['AVG', 'MIN', 'MAX'];

      invalidAggregations.forEach((aggregation) => {
        const params = {
          ...baseParams,
          aggregation,
          yAxis: '*',
        };

        const result = builder.buildQuery(params);

        expect(result.isAggregated).toBe(true);
        const { sql: sqlStr } = sqlToString(result.query.sql);
        // Should convert invalid aggregations to COUNT(*)
        expect(sqlStr).toContain('COUNT(*)');
        expect(sqlStr).not.toContain(`${aggregation}(*)`);
      });
    });

    it('should preserve valid aggregations with specific columns', () => {
      const validAggregations = [
        ['AVG', 'age'],
        ['MIN', 'score'],
        ['MAX', 'price'],
        ['SUM', 'amount'],
      ];

      validAggregations.forEach(([aggregation, column]) => {
        const params = {
          ...baseParams,
          aggregation,
          yAxis: column,
        };

        const result = builder.buildQuery(params);

        expect(result.isAggregated).toBe(true);
        const { sql: sqlStr } = sqlToString(result.query.sql);
        // Should preserve valid aggregations with specific columns
        expect(sqlStr).toContain(`${aggregation}("${column}")`);
      });
    });

    it('should handle groupBy columns', () => {
      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        yAxis: '*',
        groupBy: ['category', 'status'],
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('GROUP BY');
      expect(sqlStr).toContain('"category"');
      expect(sqlStr).toContain('"status"');
    });

    it('should handle xAxis grouping', () => {
      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        yAxis: '*',
        xAxis: 'created_date',
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('"created_date"');
      expect(sqlStr).toContain('GROUP BY');
    });

    it('should handle time aggregation', () => {
      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        yAxis: '*',
        xAxis: 'created_at',
        timeAggregation: 'day',
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('DATE_TRUNC');
      expect(sqlStr).toContain('day');
      expect(sqlStr).toContain('"created_at"');
    });

    it('should default sort by time for time-series queries', () => {
      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        yAxis: '*',
        xAxis: 'created_at',
        timeAggregation: 'week',
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('ORDER BY');
      expect(sqlStr).toContain('DATE_TRUNC');
      expect(sqlStr).toContain('ASC');
    });

    it('should handle aggregationColumn parameter', () => {
      const params = {
        ...baseParams,
        aggregation: 'MAX',
        aggregationColumn: 'price',
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('MAX("price")');
    });

    it('should convert SUM(*) to COUNT(*) with aggregationColumn', () => {
      const params = {
        ...baseParams,
        aggregation: 'SUM',
        aggregationColumn: '*',
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('COUNT(*)');
      expect(sqlStr).not.toContain('SUM(*)');
    });
  });

  describe('SQL injection guards (allowlists)', () => {
    it('rejects a timeAggregation that is not an allowlisted DATE_TRUNC unit', () => {
      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        aggregationColumn: 'id',
        xAxis: 'created_at',
        // Classic single-quote breakout payload
        timeAggregation: `day', (SELECT current_setting('x'))) --`,
      };

      expect(() => builder.buildQuery(params)).toThrow(
        /Unsupported time aggregation/,
      );
    });

    it('rejects an aggregation function that is not allowlisted', () => {
      const params = {
        ...baseParams,
        aggregation: 'COUNT(*), (SELECT password FROM auth.users) AS x -- ',
        aggregationColumn: 'id',
      };

      expect(() => builder.buildQuery(params)).toThrow(
        /Unsupported aggregation function/,
      );
    });

    it('accepts allowlisted values case-insensitively', () => {
      const params = {
        ...baseParams,
        aggregation: 'sum',
        aggregationColumn: 'price',
        xAxis: 'created_at',
        timeAggregation: 'Month',
      };

      const result = builder.buildQuery(params);
      const { sql: sqlStr } = sqlToString(result.query.sql);

      expect(sqlStr).toContain(`DATE_TRUNC('month'`);
      expect(sqlStr).toContain('SUM("price")');
    });
  });

  describe('HAVING clause support', () => {
    it('should build HAVING clause for post-aggregation filtering', () => {
      const havingFilters: FilterCondition[] = [
        {
          column: 'value',
          operator: 'gt',
          value: '100',
          type: 'number',
        },
      ];

      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        yAxis: '*',
        havingFilters,
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('HAVING');
      expect(sqlStr).toContain('COUNT(*)');
    });

    it('should not add HAVING clause for non-aggregated queries', () => {
      const havingFilters: FilterCondition[] = [
        {
          column: 'value',
          operator: 'gt',
          value: '100',
          type: 'number',
        },
      ];

      const params = {
        ...baseParams,
        havingFilters, // No aggregation, so HAVING should be ignored
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(false);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).not.toContain('HAVING');
    });

    it('should handle both WHERE and HAVING filters in same query', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
          type: 'text',
        },
      ];

      const havingFilters: FilterCondition[] = [
        {
          column: 'value',
          operator: 'gte',
          value: '50',
          type: 'number',
        },
      ];

      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        yAxis: '*',
        groupBy: ['category'],
        filters,
        havingFilters,
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('WHERE');
      expect(sqlStr).toContain('HAVING');
      expect(sqlStr).toContain('GROUP BY');
    });

    it('should handle multiple HAVING conditions', () => {
      const havingFilters: FilterCondition[] = [
        {
          column: 'value',
          operator: 'gte',
          value: '10',
          type: 'number',
        },
        {
          column: 'value',
          operator: 'lte',
          value: '100',
          type: 'number',
        },
      ];

      const params = {
        ...baseParams,
        aggregation: 'SUM',
        yAxis: 'amount',
        groupBy: ['region'],
        havingFilters,
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('HAVING');
      expect(sqlStr).toContain('SUM("amount")');
    });
  });

  describe('Smart filter categorization', () => {
    it('should categorize filters correctly for aggregated queries', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
          type: 'text',
        },
        {
          column: 'value',
          operator: 'gt',
          value: '100',
          type: 'number',
        },
        {
          column: 'COUNT(*)',
          operator: 'gte',
          value: '5',
          type: 'number',
        },
      ];

      const result = TableQueryBuilder.categorizeFilters(filters, {
        isAggregated: true,
        yAxis: '*',
        aggregation: 'count',
      });

      expect(result.whereFilters).toHaveLength(1);
      expect(result.whereFilters[0].column).toBe('status');

      expect(result.havingFilters).toHaveLength(2);
      expect(
        result.havingFilters.find((f) => f.column === 'value'),
      ).toBeDefined();
      expect(
        result.havingFilters.find((f) => f.column === 'COUNT(*)'),
      ).toBeDefined();
    });

    it('should put all filters in WHERE for non-aggregated queries', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
          type: 'text',
        },
        {
          column: 'value',
          operator: 'gt',
          value: '100',
          type: 'number',
        },
      ];

      const result = TableQueryBuilder.categorizeFilters(filters, {
        isAggregated: false,
      });

      expect(result.whereFilters).toHaveLength(2);
      expect(result.havingFilters).toHaveLength(0);
    });

    it('should detect aggregation function patterns in filter columns', () => {
      const filters: FilterCondition[] = [
        {
          column: 'SUM(revenue)',
          operator: 'gt',
          value: '1000',
          type: 'number',
        },
        {
          column: 'AVG(rating)',
          operator: 'gte',
          value: '4.0',
          type: 'number',
        },
        {
          column: 'category',
          operator: 'eq',
          value: 'electronics',
          type: 'text',
        },
      ];

      const result = TableQueryBuilder.categorizeFilters(filters, {
        isAggregated: true,
        yAxis: 'revenue',
        aggregation: 'sum',
      });

      expect(result.whereFilters).toHaveLength(1);
      expect(result.whereFilters[0].column).toBe('category');

      expect(result.havingFilters).toHaveLength(2);
      expect(
        result.havingFilters.find((f) => f.column === 'SUM(revenue)'),
      ).toBeDefined();
      expect(
        result.havingFilters.find((f) => f.column === 'AVG(rating)'),
      ).toBeDefined();
    });
  });

  describe('Complex scenarios', () => {
    it('should handle time aggregation with groupBy and filters', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'completed',
          type: 'text',
        },
      ];

      const params = {
        ...baseParams,
        aggregation: 'SUM',
        yAxis: 'amount',
        xAxis: 'created_at',
        timeAggregation: 'month',
        groupBy: ['category'],
        filters,
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      const { sql: sqlStr } = sqlToString(result.query.sql);

      // Should have all components
      expect(sqlStr).toContain('SUM("amount")');
      expect(sqlStr).toContain('DATE_TRUNC');
      expect(sqlStr).toContain('month');
      expect(sqlStr).toContain('"category"');
      expect(sqlStr).toContain('GROUP BY');
      expect(sqlStr).toContain('WHERE');
    });

    it('should handle empty groupBy array', () => {
      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        yAxis: '*',
        groupBy: [],
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);
      // Should still work even with empty groupBy
      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('COUNT(*)');
    });

    it('should quote column names with special characters', () => {
      const params = {
        ...baseParams,
        properties: { columns: ['user-id', 'first name', 'email@domain'] },
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('"user-id"');
      expect(sqlStr).toContain('"first name"');
      expect(sqlStr).toContain('"email@domain"');
    });

    it('should escape quotes in column names', () => {
      const params = {
        ...baseParams,
        properties: { columns: ['column"with"quotes'] },
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(sqlStr).toContain('"column""with""quotes"');
    });
  });

  describe('Column selection', () => {
    it('should select only requested columns without modification', () => {
      const params = {
        ...baseParams,
        properties: {
          columns: ['email', 'name', 'created_at'],
        },
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      // Should include only the requested columns (no automatic id addition)
      expect(sqlStr).toContain('"email"');
      expect(sqlStr).toContain('"name"');
      expect(sqlStr).toContain('"created_at"');
      expect(sqlStr).not.toContain('"id"');
    });

    it('should include id column when explicitly requested', () => {
      const params = {
        ...baseParams,
        properties: {
          columns: ['id', 'email', 'name'],
        },
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      // Should include id only once when explicitly requested
      const idMatches = sqlStr.match(/"id"/g);
      expect(idMatches).toBeTruthy();
      expect(idMatches!.length).toBe(1);
    });

    it('should respect any column names provided', () => {
      const params = {
        ...baseParams,
        properties: {
          columns: ['uuid', 'email', 'name'],
        },
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      // Should include exactly what was requested
      expect(sqlStr).toContain('"uuid"');
      expect(sqlStr).toContain('"email"');
      expect(sqlStr).toContain('"name"');
      expect(sqlStr).not.toContain('"id"');
    });

    it('should handle primary keys with any name', () => {
      const params = {
        ...baseParams,
        properties: {
          columns: ['user_id', 'email', 'name'],
        },
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      // Should include exactly what was requested
      expect(sqlStr).toContain('"user_id"');
      expect(sqlStr).toContain('"email"');
      expect(sqlStr).toContain('"name"');
    });

    it('should not modify columns for aggregated queries', () => {
      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        aggregationColumn: '*',
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      expect(result.isAggregated).toBe(true);
      // Aggregated queries should only have the aggregation
      expect(sqlStr).toContain('COUNT(*)');
    });

    it('should use * for empty column list', () => {
      const params = {
        ...baseParams,
        properties: {
          columns: [],
        },
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      // Should use * for empty column list
      expect(sqlStr).toMatch(/SELECT\s+\*,\s+COUNT\(\*\)\s+OVER\(\)/);
    });
  });

  describe('SQL injection prevention', () => {
    it('should safely handle malicious column names', () => {
      const params = {
        ...baseParams,
        sortColumn: 'id; DROP TABLE users; --',
      };

      const result = builder.buildQuery(params);

      const { sql: sqlStr } = sqlToString(result.query.sql);
      // Should be properly quoted
      expect(sqlStr).toContain('"id; DROP TABLE users; --"');
      // Should not contain unescaped SQL
      expect(sqlStr).not.toMatch(/DROP TABLE users(?!.*")/);
    });

    it('should safely handle malicious search terms', () => {
      const params = {
        ...baseParams,
        search: "'; DROP TABLE users; --",
      };

      const result = builder.buildQuery(params);

      // Search terms should be parameterized
      const { params: sqlParams } = sqlToString(result.query.sql);
      expect(sqlParams).toContain("%'; DROP TABLE users; --%");
    });
  });
});
