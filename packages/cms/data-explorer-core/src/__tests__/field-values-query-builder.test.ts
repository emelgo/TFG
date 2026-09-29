import { type SQL, sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { FieldValuesQueryBuilder } from '../lib/field-values-query-builder';

const pgDialect = new PgDialect();

/**
 * Convert a Drizzle SQL object to string and params for testing
 */
export function sqlToString(sqlObject: SQL): {
  sql: string;
  params: unknown[];
} {
  return pgDialect.sqlToQuery(sqlObject);
}

describe('FieldValuesQueryBuilder', () => {
  describe('buildWhereConditions', () => {
    it('should build conditions with NOT NULL only', () => {
      const conditions = FieldValuesQueryBuilder.buildWhereConditions({
        fieldName: 'status',
        includeNotNull: true,
        includeNotEmpty: false,
      });

      expect(conditions).toHaveLength(1);
      const { sql: sqlStr } = sqlToString(conditions[0]);
      expect(sqlStr).toContain('IS NOT NULL');
    });

    it('should build conditions with NOT NULL and NOT EMPTY', () => {
      const conditions = FieldValuesQueryBuilder.buildWhereConditions({
        fieldName: 'name',
        includeNotNull: true,
        includeNotEmpty: true,
      });

      expect(conditions).toHaveLength(2);
      const { sql: sql1 } = sqlToString(conditions[0]);
      const { sql: sql2 } = sqlToString(conditions[1]);
      expect(sql1).toContain('IS NOT NULL');
      expect(sql2).toContain('!=');
    });

    it('should build conditions with search pattern', () => {
      const conditions = FieldValuesQueryBuilder.buildWhereConditions({
        fieldName: 'email',
        includeNotNull: true,
        includeNotEmpty: true,
        searchPattern: '%test%',
      });

      expect(conditions).toHaveLength(3);
      const { sql: sql3, params } = sqlToString(conditions[2]);
      expect(sql3).toContain('ILIKE');
      expect(params).toContain('%test%');
    });

    it('should handle no conditions', () => {
      const conditions = FieldValuesQueryBuilder.buildWhereConditions({
        fieldName: 'id',
        includeNotNull: false,
        includeNotEmpty: false,
      });

      expect(conditions).toHaveLength(0);
    });
  });

  describe('buildUniqueValuesQuery', () => {
    it('should build query for unique values', () => {
      const conditions = [sql`"status" IS NOT NULL`, sql`"status" != ''`];

      const query = FieldValuesQueryBuilder.buildUniqueValuesQuery({
        schemaName: 'public',
        tableName: 'users',
        fieldName: 'status',
        conditions,
        limit: 10,
      });

      const { sql: sqlStr, params } = sqlToString(query);
      expect(sqlStr).toContain('SELECT DISTINCT');
      expect(sqlStr).toContain('::text as value');
      expect(sqlStr).toContain('ORDER BY');
      expect(sqlStr).toContain('LIMIT');
      expect(params).toContain(10);
    });

    it('should handle empty conditions', () => {
      const query = FieldValuesQueryBuilder.buildUniqueValuesQuery({
        schemaName: 'public',
        tableName: 'users',
        fieldName: 'email',
        conditions: [],
        limit: 5,
      });

      const { sql: sqlStr, params } = sqlToString(query);
      expect(sqlStr).toContain('SELECT DISTINCT');
      expect(sqlStr).toContain('LIMIT');
      expect(params).toContain(5);
    });
  });

  describe('buildUniqueValuesFallbackQuery', () => {
    it('should use only first condition for fallback', () => {
      const conditions = [
        sql`"uuid_field" IS NOT NULL`,
        sql`"uuid_field" != ''`,
        sql`"uuid_field"::text ILIKE '%test%'`,
      ];

      const query = FieldValuesQueryBuilder.buildUniqueValuesFallbackQuery({
        schemaName: 'public',
        tableName: 'items',
        fieldName: 'uuid_field',
        conditions,
        limit: 10,
      });

      const { sql: sqlStr } = sqlToString(query);
      expect(sqlStr).toContain('WHERE');
      expect(sqlStr).toContain('IS NOT NULL');
      expect(sqlStr).toContain('ILIKE'); // Should include search
      expect(sqlStr).not.toContain("!= '''"); // Should skip empty check
    });
  });

  describe('buildTopHitsQuery', () => {
    it('should build query for small tables', () => {
      const conditions = [sql`"category" IS NOT NULL`];

      const query = FieldValuesQueryBuilder.buildTopHitsQuery({
        schemaName: 'public',
        tableName: 'products',
        fieldName: 'category',
        conditions,
        limit: 10,
        tableSize: 5000, // Small table
      });

      const { sql: sqlStr, params } = sqlToString(query);
      expect(sqlStr).toContain('COUNT(*) as count');
      expect(sqlStr).toContain('GROUP BY');
      expect(sqlStr).toContain('ORDER BY COUNT(*) DESC');
      expect(sqlStr).not.toContain('RANDOM()'); // No sampling
      expect(params).toContain(5); // Math.min(10, 5)
    });

    it('should use sampling for large tables', () => {
      const conditions = [sql`"category" IS NOT NULL`];

      const query = FieldValuesQueryBuilder.buildTopHitsQuery({
        schemaName: 'public',
        tableName: 'products',
        fieldName: 'category',
        conditions,
        limit: 10,
        tableSize: 200000, // Large table
      });

      const { sql: sqlStr } = sqlToString(query);
      expect(sqlStr).toContain('RANDOM()');
      expect(sqlStr).toContain('10000'); // Sampling limit
      expect(sqlStr).toContain('sampled');
    });
  });

  describe('buildTopHitsFallbackQuery', () => {
    it('should use only first condition', () => {
      const conditions = [sql`"type" IS NOT NULL`, sql`"type" != ''`];

      const query = FieldValuesQueryBuilder.buildTopHitsFallbackQuery({
        schemaName: 'public',
        tableName: 'events',
        fieldName: 'type',
        conditions,
        limit: 10,
        tableSize: 1000,
      });

      const { sql: sqlStr } = sqlToString(query);
      expect(sqlStr).toContain('IS NOT NULL');
      expect(sqlStr).not.toContain("!= '''"); // The != check should be skipped
    });
  });

  describe('buildTableSizeQuery', () => {
    it('should build query for table size estimation', () => {
      const query = FieldValuesQueryBuilder.buildTableSizeQuery(
        'public',
        'users',
      );

      const { sql: sqlStr, params } = sqlToString(query);
      expect(sqlStr).toContain('reltuples::BIGINT as estimate');
      expect(sqlStr).toContain('pg_class');
      expect(sqlStr).toContain('pg_namespace');
      expect(params).toContain('users');
      expect(params).toContain('public');
    });
  });
});
