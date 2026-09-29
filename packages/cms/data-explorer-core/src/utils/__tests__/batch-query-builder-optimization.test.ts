import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildBatchSelectQuery } from '../batch-query-builder';

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

describe('buildBatchSelectQuery - Column Selection Optimization', () => {
  const schema = 'public';
  const table = 'users';
  const column = 'id';
  const values = ['1', '2', '3'];

  describe('Function Behavior', () => {
    it('should return SQL object when no columns specified', () => {
      const query = buildBatchSelectQuery(schema, table, column, values);
      const { sql } = sqlToString(query);

      // Test that it returns a proper SQL object with SELECT *
      expect(query).toBeDefined();
      expect(sql).toContain('SELECT *');
      expect(sql).toContain('FROM "public"."users"');
      expect(sql).toContain('WHERE "id" IN ($1, $2, $3)');
    });

    it('should return SQL object when empty columns array provided', () => {
      const query = buildBatchSelectQuery(schema, table, column, values, []);
      const { sql } = sqlToString(query);

      // Should behave same as undefined columns (SELECT *)
      expect(query).toBeDefined();
      expect(sql).toContain('SELECT *');
    });

    it('should return SQL object with specific columns', () => {
      const selectColumns = ['id', 'name', 'email'];
      const query = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
        selectColumns,
      );
      const { sql } = sqlToString(query);

      // Test that it returns a proper SQL object with selective columns
      expect(query).toBeDefined();
      expect(sql).toContain('SELECT "id", "name", "email"');
      expect(sql).not.toContain('SELECT *');
      expect(sql).toContain('FROM "public"."users"');
    });

    it('should handle single column selection', () => {
      const selectColumns = ['name'];
      const query = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
        selectColumns,
      );
      const { sql } = sqlToString(query);

      expect(query).toBeDefined();
      expect(sql).toContain('SELECT "name"');
      expect(sql).not.toContain('SELECT *');
    });

    it('should handle empty values array by throwing error', () => {
      expect(() => {
        buildBatchSelectQuery(schema, table, column, [], ['id', 'name']);
      }).toThrow('Cannot build batch query with empty values array');
    });

    it('should handle different schema and table combinations', () => {
      const selectColumns = ['category_id', 'name'];
      const query = buildBatchSelectQuery(
        'inventory',
        'products',
        'product_id',
        values,
        selectColumns,
      );

      expect(query).toBeDefined();
      expect(query.queryChunks).toBeDefined();
    });
  });

  describe('Column Selection Logic', () => {
    it('should differentiate between SELECT * and selective queries', () => {
      const querySelectAll = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
      );
      const querySelective = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
        ['id', 'name'],
      );

      const sqlSelectAll = sqlToString(querySelectAll).sql;
      const sqlSelective = sqlToString(querySelective).sql;

      // SELECT * query
      expect(sqlSelectAll).toContain('SELECT *');
      expect(sqlSelectAll).not.toContain('SELECT "id"');

      // Selective query
      expect(sqlSelective).toContain('SELECT "id", "name"');
      expect(sqlSelective).not.toContain('SELECT *');

      // Both have proper WHERE clause
      expect(sqlSelectAll).toContain('WHERE "id" IN');
      expect(sqlSelective).toContain('WHERE "id" IN');
    });

    it('should handle various column count scenarios', () => {
      // Test different column counts
      const scenarios = [
        ['id'], // Single column
        ['id', 'name'], // Two columns
        ['id', 'name', 'email', 'created_at', 'status'], // Many columns
      ];

      scenarios.forEach((columns) => {
        const query = buildBatchSelectQuery(
          schema,
          table,
          column,
          values,
          columns,
        );
        expect(query).toBeDefined();
        expect(query.queryChunks).toBeDefined();
      });
    });
  });

  describe('Parameter Handling', () => {
    it('should handle single value', () => {
      const singleValue = ['single-id'];
      const query = buildBatchSelectQuery(schema, table, column, singleValue, [
        'id',
        'name',
      ]);

      expect(query).toBeDefined();
      expect(query.queryChunks).toBeDefined();
    });

    it('should handle large value arrays', () => {
      const largeValues = Array.from({ length: 50 }, (_, i) => `id-${i}`);
      const query = buildBatchSelectQuery(schema, table, column, largeValues, [
        'id',
        'name',
      ]);

      expect(query).toBeDefined();
      expect(query.queryChunks).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility when selectColumns is undefined', () => {
      const query = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
        undefined,
      );

      expect(query).toBeDefined();
      expect(query.queryChunks).toBeDefined();
    });

    it('should handle null selectColumns gracefully', () => {
      // @ts-expect-error Testing null case for robustness
      const query = buildBatchSelectQuery(schema, table, column, values, null);

      expect(query).toBeDefined();
    });

    it('should produce consistent results for empty array vs undefined', () => {
      const queryUndefined = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
        undefined,
      );
      const queryEmpty = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
        [],
      );

      // Both should produce SELECT * queries
      expect(queryUndefined).toBeDefined();
      expect(queryEmpty).toBeDefined();
      expect(queryUndefined.queryChunks.length).toBe(
        queryEmpty.queryChunks.length,
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle complex column names', () => {
      const selectColumns = ['_internal_id', 'meta_data', 'updated_at_2023'];
      const query = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
        selectColumns,
      );

      expect(query).toBeDefined();
      expect(query.queryChunks).toBeDefined();
    });

    it('should validate empty values array', () => {
      expect(() => {
        buildBatchSelectQuery(schema, table, column, []);
      }).toThrow('Cannot build batch query with empty values array');
    });

    it('should handle special characters in column names (Drizzle will escape)', () => {
      const selectColumns = ['user-name', 'email@domain'];
      const query = buildBatchSelectQuery(
        schema,
        table,
        column,
        values,
        selectColumns,
      );

      // Should not throw, Drizzle handles escaping
      expect(query).toBeDefined();
      expect(query.queryChunks).toBeDefined();
    });
  });
});
