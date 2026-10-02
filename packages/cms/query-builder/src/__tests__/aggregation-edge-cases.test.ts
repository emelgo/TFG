/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import { SelectBuilder } from '../clauses/select-builder';
import { QueryBuilder } from '../core/query-builder';
import { sqlToString } from './test-helpers';

describe('QueryBuilder - Aggregation Edge Cases', () => {
  describe('SelectBuilder SUM Aggregation Fixes', () => {
    it('should default SUM(*) to COUNT(*) when column is wildcard', () => {
      const selectClause = SelectBuilder.withAggregation({
        column: '*',
        aggregation: 'sum',
        alias: 'total',
      });

      const result = QueryBuilder.from('public', 'users')
        .select(selectClause)
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('(COUNT(*))::numeric AS "total"');
      expect(sql).not.toContain('SUM(*)');
    });

    it('should preserve SUM for specific numeric columns', () => {
      const selectClause = SelectBuilder.withAggregation({
        column: 'salary',
        aggregation: 'sum',
        alias: 'total_salary',
      });

      const result = QueryBuilder.from('public', 'users')
        .select(selectClause)
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('(SUM("salary"))::numeric AS "total_salary"');
    });

    it('should handle SUM with complex expressions', () => {
      const result = QueryBuilder.from('public', 'users')
        .select({
          columns: [{ expression: 'SUM(COALESCE(salary, 0))', alias: 'total' }],
        })
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('SUM(COALESCE(salary, 0)) AS "total"');
    });
  });

  describe('SelectBuilder AVG Aggregation', () => {
    it('should handle AVG with NULL values', () => {
      const selectClause = SelectBuilder.withAggregation({
        column: 'rating',
        aggregation: 'avg',
        alias: 'avg_rating',
      });

      const result = QueryBuilder.from('public', 'users')
        .select(selectClause)
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('(AVG("rating"))::numeric AS "avg_rating"');
    });

    it('should not allow AVG(*) and default to COUNT(*)', () => {
      const selectClause = SelectBuilder.withAggregation({
        column: '*',
        aggregation: 'avg',
        alias: 'average',
      });

      const result = QueryBuilder.from('public', 'users')
        .select(selectClause)
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('(COUNT(*))::numeric AS "average"');
    });
  });

  describe('DATE_TRUNC Time Aggregations', () => {
    it('should handle DATE_TRUNC with different intervals', () => {
      const intervals = ['hour', 'day', 'week', 'month', 'quarter', 'year'];

      intervals.forEach((interval) => {
        const result = QueryBuilder.from('public', 'events')
          .select({
            columns: [
              {
                expression: `DATE_TRUNC('${interval}', created_at)`,
                alias: `${interval}_bucket`,
              },
            ],
          })
          .build();

        const { sql } = sqlToString(result.sql);
        expect(sql).toContain(`DATE_TRUNC('${interval}', created_at)`);
      });
    });

    it('should handle timezone-aware DATE_TRUNC', () => {
      const result = QueryBuilder.from('public', 'events')
        .select({
          columns: [
            {
              expression: "DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')",
              alias: 'utc_day',
            },
          ],
        })
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain("DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')");
    });
  });

  describe('Multi-Series Aggregations', () => {
    it('should handle multiple aggregations with different functions', () => {
      const result = QueryBuilder.from('public', 'sales')
        .select({
          columns: [
            { expression: '"product_category"' },
            { expression: 'SUM("amount")', alias: 'total_amount' },
            { expression: 'AVG("amount")', alias: 'avg_amount' },
            { expression: 'COUNT("id")', alias: 'sale_count' },
          ],
        })
        .groupBy({
          expressions: ['product_category'],
        })
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('SUM("amount") AS "total_amount"');
      expect(sql).toContain('AVG("amount") AS "avg_amount"');
      expect(sql).toContain('COUNT("id") AS "sale_count"');
      expect(sql).toContain('GROUP BY product_category');
    });

    it('should test SelectBuilder aggregation combinations', () => {
      // Test using SelectBuilder for complex multi-aggregation scenarios
      const multiMetricSelect = SelectBuilder.merge(
        SelectBuilder.columns(['product_category']),
        SelectBuilder.withAggregation({
          column: 'amount',
          aggregation: 'sum',
          alias: 'total',
        }),
        SelectBuilder.withAggregation({
          column: 'amount',
          aggregation: 'avg',
          alias: 'average',
        }),
        SelectBuilder.withAggregation({
          column: '*',
          aggregation: 'count',
          alias: 'count',
        }),
      );

      const result = QueryBuilder.from('public', 'sales')
        .select(multiMetricSelect)
        .groupBy({ expressions: ['product_category'] })
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('(SUM("amount"))::numeric AS "total"');
      expect(sql).toContain('(AVG("amount"))::numeric AS "average"');
      expect(sql).toContain('(COUNT(*))::numeric AS "count"');
    });
  });
});
