import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { FilterCondition } from '@pymekit/cms-filters-core';

import { TableQueryBuilder } from '../table-query-builder';

const pgDialect = new PgDialect();

/**
 * Convert a Drizzle SQL object to string for testing
 */
function sqlToString(sqlObject: SQL): {
  sql: string;
  params: unknown[];
} {
  return pgDialect.sqlToQuery(sqlObject);
}

describe('HAVING Integration Tests', () => {
  const builder = new TableQueryBuilder();

  const baseParams = {
    schemaName: 'public',
    tableName: 'orders',
    page: 1,
    pageSize: 10,
  };

  describe('Real-world HAVING scenarios', () => {
    it('should generate correct SQL for "show categories with more than 100 orders"', () => {
      const havingFilters: FilterCondition[] = [
        {
          column: 'value', // This is the alias for COUNT(*)
          operator: 'gt',
          value: '100',
          type: 'number',
        },
      ];

      const params = {
        ...baseParams,
        aggregation: 'COUNT',
        yAxis: '*',
        groupBy: ['category'],
        havingFilters,
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);

      // Should contain both GROUP BY and HAVING
      const { sql: queryStr } = sqlToString(result.query.sql);
      expect(queryStr).toContain('GROUP BY');
      expect(queryStr).toContain('HAVING');
      expect(queryStr).toContain('COUNT(*)');
    });

    it('should generate correct SQL for "show months where average sales > $1000"', () => {
      const havingFilters: FilterCondition[] = [
        {
          column: 'value', // This is the alias for AVG(sales)
          operator: 'gt',
          value: '1000',
          type: 'number',
        },
      ];

      const params = {
        ...baseParams,
        aggregation: 'AVG',
        yAxis: 'sales_amount',
        xAxis: 'created_at',
        timeAggregation: 'month',
        havingFilters,
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);

      const { sql: queryStr } = sqlToString(result.query.sql);
      expect(queryStr).toContain('DATE_TRUNC');
      expect(queryStr).toContain('AVG("sales_amount")');
      expect(queryStr).toContain('GROUP BY');
      expect(queryStr).toContain('HAVING');
    });

    it('should handle both WHERE and HAVING in complex scenario', () => {
      const whereFilters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'completed',
          type: 'text',
        },
        {
          column: 'region',
          operator: 'in',
          value: ['US', 'CA'],
          type: 'text',
        },
      ];

      const havingFilters: FilterCondition[] = [
        {
          column: 'value', // SUM(revenue) alias
          operator: 'gte',
          value: '10000',
          type: 'number',
        },
      ];

      const params = {
        ...baseParams,
        aggregation: 'SUM',
        yAxis: 'revenue',
        groupBy: ['product_category'],
        filters: whereFilters,
        havingFilters,
      };

      const result = builder.buildQuery(params);

      expect(result.isAggregated).toBe(true);

      const { sql: queryStr } = sqlToString(result.query.sql);

      // Should contain all SQL clauses in correct order
      expect(queryStr).toContain('WHERE');
      expect(queryStr).toContain('GROUP BY');
      expect(queryStr).toContain('HAVING');
      expect(queryStr).toContain('SUM("revenue")');

      // Verify WHERE comes before GROUP BY comes before HAVING
      const whereIndex = queryStr.indexOf('WHERE');
      const groupByIndex = queryStr.indexOf('GROUP BY');
      const havingIndex = queryStr.indexOf('HAVING');

      expect(whereIndex).toBeLessThan(groupByIndex);
      expect(groupByIndex).toBeLessThan(havingIndex);
    });
  });

  describe('Smart filter categorization scenarios', () => {
    it('should auto-categorize mixed filters correctly', () => {
      const mixedFilters: FilterCondition[] = [
        // These should go to WHERE (pre-aggregation)
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
          type: 'text',
        },
        {
          column: 'created_at',
          operator: 'gte',
          value: '2024-01-01',
          type: 'date',
        },
        // These should go to HAVING (post-aggregation)
        {
          column: 'value',
          operator: 'gt',
          value: '50',
          type: 'number',
        },
        {
          column: 'COUNT(*)',
          operator: 'gte',
          value: '10',
          type: 'number',
        },
      ];

      const categorized = TableQueryBuilder.categorizeFilters(mixedFilters, {
        isAggregated: true,
        yAxis: '*',
        aggregation: 'count',
      });

      expect(categorized.whereFilters).toHaveLength(2);
      expect(categorized.havingFilters).toHaveLength(2);

      // Verify correct categorization
      expect(
        categorized.whereFilters.find((f) => f.column === 'status'),
      ).toBeDefined();
      expect(
        categorized.whereFilters.find((f) => f.column === 'created_at'),
      ).toBeDefined();

      expect(
        categorized.havingFilters.find((f) => f.column === 'value'),
      ).toBeDefined();
      expect(
        categorized.havingFilters.find((f) => f.column === 'COUNT(*)'),
      ).toBeDefined();
    });

    it('should put all filters in WHERE for non-aggregated queries', () => {
      const filters: FilterCondition[] = [
        {
          column: 'value', // Even this goes to WHERE when not aggregated
          operator: 'gt',
          value: '100',
          type: 'number',
        },
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
          type: 'text',
        },
      ];

      const categorized = TableQueryBuilder.categorizeFilters(filters, {
        isAggregated: false,
      });

      expect(categorized.whereFilters).toHaveLength(2);
      expect(categorized.havingFilters).toHaveLength(0);
    });

    it('should detect aggregation function patterns in filter columns', () => {
      const filters: FilterCondition[] = [
        {
          column: 'SUM(revenue)',
          operator: 'gt',
          value: '10000',
          type: 'number',
        },
        {
          column: 'AVG(rating)',
          operator: 'gte',
          value: '4.0',
          type: 'number',
        },
        {
          column: 'MIN(price)',
          operator: 'gt',
          value: '10',
          type: 'number',
        },
        {
          column: 'MAX(quantity)',
          operator: 'lte',
          value: '1000',
          type: 'number',
        },
        {
          column: 'category',
          operator: 'eq',
          value: 'electronics',
          type: 'text',
        },
      ];

      const categorized = TableQueryBuilder.categorizeFilters(filters, {
        isAggregated: true,
        yAxis: 'revenue',
        aggregation: 'sum',
      });

      expect(categorized.whereFilters).toHaveLength(1);
      expect(categorized.whereFilters[0].column).toBe('category');

      expect(categorized.havingFilters).toHaveLength(4);
      expect(
        categorized.havingFilters.find((f) => f.column === 'SUM(revenue)'),
      ).toBeDefined();
      expect(
        categorized.havingFilters.find((f) => f.column === 'AVG(rating)'),
      ).toBeDefined();
      expect(
        categorized.havingFilters.find((f) => f.column === 'MIN(price)'),
      ).toBeDefined();
      expect(
        categorized.havingFilters.find((f) => f.column === 'MAX(quantity)'),
      ).toBeDefined();
    });
  });
});
