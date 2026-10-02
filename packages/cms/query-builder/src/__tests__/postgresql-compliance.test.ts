/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import { QueryBuilder } from '../core/query-builder';
import { sqlToString } from './test-helpers';

describe('QueryBuilder - PostgreSQL Compliance', () => {
  describe('Identifier Quoting', () => {
    it('should quote all table identifiers with double quotes', () => {
      const result = QueryBuilder.from('public', 'user_accounts').build();
      const { sql } = sqlToString(result.sql);

      expect(sql).toMatch(/FROM "public"\."user_accounts"/);
    });

    it('should handle column expressions in SELECT', () => {
      const result = QueryBuilder.from('public', 'users')
        .select({
          columns: [
            { expression: 'first_name' },
            { expression: 'last_name' },
            { expression: 'email_address' },
          ],
        })
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('first_name');
      expect(sql).toContain('last_name');
      expect(sql).toContain('email_address');
    });

    it('should handle reserved keywords correctly when quoted', () => {
      const reservedKeywords = ['order', 'group', 'select', 'from', 'where'];

      reservedKeywords.forEach((keyword) => {
        const result = QueryBuilder.from('public', 'test')
          .select({
            columns: [{ expression: `"${keyword}"` }], // Explicitly quote reserved keywords
          })
          .build();

        const { sql } = sqlToString(result.sql);
        expect(sql).toContain(`"${keyword}"`);
      });
    });

    it('should quote aliases correctly', () => {
      const result = QueryBuilder.from('public', 'users')
        .select({
          columns: [
            { expression: 'COUNT(*)', alias: 'total_count' },
            { expression: 'MAX(created_at)', alias: 'latest_signup' },
          ],
        })
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('AS "total_count"');
      expect(sql).toContain('AS "latest_signup"');
    });
  });

  describe('String Literals', () => {
    it('should use single quotes for string literals', () => {
      const result = QueryBuilder.from('public', 'users')
        .whereFilters([
          {
            column: 'status',
            operator: 'eq',
            value: 'active',
          },
        ])
        .build();

      const { sql, params } = sqlToString(result.sql);
      expect(params).toContain('active');
      // Parameter placeholder should be used, not direct string embedding
      expect(sql).toContain('WHERE');
      expect(sql).toContain('status');
    });

    it('should escape single quotes in string values', () => {
      const valueWithQuotes = "O'Connor";

      const result = QueryBuilder.from('public', 'users')
        .whereFilters([
          {
            column: 'last_name',
            operator: 'eq',
            value: valueWithQuotes,
          },
        ])
        .build();

      const { params } = sqlToString(result.sql);
      expect(params).toContain(valueWithQuotes);
    });
  });

  describe('Schema Qualification', () => {
    it('should properly qualify schema.table names', () => {
      const schemas = ['public', 'auth', 'cms'];

      schemas.forEach((schema) => {
        const result = QueryBuilder.from(schema, 'test_table').build();
        const { sql } = sqlToString(result.sql);

        expect(sql).toMatch(new RegExp(`FROM "${schema}"\\."`));
      });
    });
  });

  describe('Data Types', () => {
    it('should handle PostgreSQL-specific data types', () => {
      const result = QueryBuilder.from('public', 'test')
        .select({
          columns: [
            { expression: 'json_data::text', alias: 'json_as_text' },
            { expression: 'created_at::date', alias: 'creation_date' },
            { expression: 'tags::text[]', alias: 'tag_array' },
          ],
        })
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('json_data::text AS "json_as_text"');
      expect(sql).toContain('created_at::date AS "creation_date"');
      expect(sql).toContain('tags::text[] AS "tag_array"');
    });
  });

  describe('Array Operations', () => {
    it('should handle PostgreSQL array operations', () => {
      const result = QueryBuilder.from('public', 'posts')
        .whereFilters([
          {
            column: 'tags',
            operator: 'array_contains',
            value: 'javascript',
          },
        ])
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('WHERE');
      // Note: array_contains operator implementation would depend on WhereBuilder
    });
  });

  describe('JSON Operations', () => {
    it('should handle PostgreSQL JSON operators', () => {
      const result = QueryBuilder.from('public', 'users')
        .select({
          columns: [
            { expression: "metadata->>'name'", alias: 'display_name' },
            { expression: "preferences->'theme'", alias: 'user_theme' },
          ],
        })
        .build();

      const { sql } = sqlToString(result.sql);
      expect(sql).toContain('metadata->>\'name\' AS "display_name"');
      expect(sql).toContain('preferences->\'theme\' AS "user_theme"');
    });
  });
});
