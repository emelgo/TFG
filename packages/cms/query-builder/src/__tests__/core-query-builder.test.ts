/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { QueryBuilder } from '../core/query-builder';
import type {
  GroupByClause,
  JoinClause,
  OrderByExpression,
  SelectClause,
  WhereClause,
} from '../types/clause-types';
import { sqlToString } from './test-helpers';

describe('QueryBuilder - Core Architecture (shared)', () => {
  describe('Basic Query Construction', () => {
    it('should create a basic SELECT * FROM query', () => {
      const result = QueryBuilder.from('public', 'users').build();

      const { sql: sqlString, params } = sqlToString(result.sql);
      expect(sqlString).toContain('SELECT *');
      expect(sqlString).toMatch(/FROM\s+.*users/);
      expect(params).toEqual([]);
    });

    it('should create query with specific columns', () => {
      const selectClause: SelectClause = {
        columns: [
          { expression: 'id' },
          { expression: 'name' },
          { expression: 'email' },
        ],
      };

      const result = QueryBuilder.from('public', 'users')
        .select(selectClause)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('SELECT id, name, email');
    });

    it('should create query with column aliases', () => {
      const selectClause: SelectClause = {
        columns: [
          { expression: 'id', alias: 'user_id' },
          { expression: 'full_name', alias: 'name' },
          { expression: 'COUNT(*)', alias: 'total_count' },
        ],
      };

      const result = QueryBuilder.from('public', 'users')
        .select(selectClause)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain(
        'SELECT id AS "user_id", full_name AS "name", COUNT(*) AS "total_count" FROM',
      );
    });

    it('should handle schema-less table references', () => {
      const result = QueryBuilder.from('', 'simple_table').build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('SELECT * FROM');
      expect(sqlString).toContain('simple_table');
    });

    it('should handle custom schema references', () => {
      const result = QueryBuilder.from('analytics', 'user_events').build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('SELECT * FROM "analytics"."user_events"');
    });
  });

  describe('Immutability and Method Chaining', () => {
    it('should create new instances with each method call', () => {
      const base = QueryBuilder.from('public', 'users');
      const withSelect = base.select({ columns: [{ expression: 'id' }] });
      const withWhere = withSelect.whereFilters([]);

      // Each should be a different instance
      expect(base).not.toBe(withSelect);
      expect(withSelect).not.toBe(withWhere);
      expect(base).not.toBe(withWhere);
    });

    it('should maintain immutability - original instance unchanged', () => {
      const original = QueryBuilder.from('public', 'users');
      const modified = original.select({ columns: [{ expression: 'id' }] });

      const originalResult = original.build();
      const modifiedResult = modified.build();

      const { sql: originalSql } = sqlToString(originalResult.sql);
      const { sql: modifiedSql } = sqlToString(modifiedResult.sql);
      expect(originalSql).toContain('SELECT *');
      expect(modifiedSql).toContain('SELECT id');
    });

    it('should support complex method chaining', () => {
      const selectClause: SelectClause = {
        columns: [
          { expression: 'status' },
          { expression: 'COUNT(*)', alias: 'count' },
        ],
      };

      const groupByClause: GroupByClause = {
        expressions: ['status'],
      };

      const orderByExpressions: OrderByExpression[] = [
        { expression: 'count', direction: 'DESC' },
      ];

      const result = QueryBuilder.from('public', 'orders')
        .select(selectClause)
        .whereFilters([
          { column: 'created_at', operator: 'gte', value: '2024-01-01' },
        ])
        .groupBy(groupByClause)
        .orderBy(orderByExpressions)
        .limit(10)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('SELECT status, COUNT(*) AS "count"');
      expect(sqlString).toContain('FROM');
      expect(sqlString).toContain('WHERE');
      expect(sqlString).toContain('GROUP BY status');
      expect(sqlString).toContain('ORDER BY count DESC');
      expect(sqlString).toMatch(/LIMIT (?:\$\d+|10)/);
    });
  });

  describe('WHERE Clause Handling', () => {
    it('should handle single filter condition', () => {
      const result = QueryBuilder.from('public', 'users')
        .whereFilters([{ column: 'status', operator: 'eq', value: 'active' }])
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('WHERE');
      expect(sqlString).toContain('status');
    });

    it('should handle multiple filter conditions', () => {
      const result = QueryBuilder.from('public', 'orders')
        .whereFilters([
          { column: 'status', operator: 'eq', value: 'completed' },
          { column: 'total', operator: 'gte', value: '100' },
          { column: 'user_id', operator: 'neq', value: null },
        ])
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('WHERE');
      expect(sqlString).toContain('status');
      expect(sqlString).toContain('total');
      expect(sqlString).toContain('user_id');
    });

    it('should handle empty filter array', () => {
      const result = QueryBuilder.from('public', 'users')
        .whereFilters([])
        .build();

      expect(result.sql).not.toContain('WHERE');
    });

    it('should accept WHERE clause directly', () => {
      const whereClause: WhereClause = {
        // @ts-expect-error - test helper uses raw
        conditions: ["age >= '18'"],
        combineWith: 'AND',
      };

      const result = QueryBuilder.from('public', 'users')
        .where(whereClause)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('WHERE');
    });
  });

  describe('GROUP BY Clause', () => {
    it('should handle GROUP BY with single column', () => {
      const groupByClause: GroupByClause = {
        expressions: ['status'],
      };

      const result = QueryBuilder.from('public', 'orders')
        .groupBy(groupByClause)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('GROUP BY status');
    });

    it('should handle GROUP BY with multiple columns', () => {
      const groupByClause: GroupByClause = {
        expressions: ['status', 'customer_id', "DATE_TRUNC('day', created_at)"],
      };

      const result = QueryBuilder.from('public', 'orders')
        .groupBy(groupByClause)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain(
        "GROUP BY status, customer_id, DATE_TRUNC('day', created_at)",
      );
    });

    it('should handle GROUP BY with ROLLUP', () => {
      const groupByClause: GroupByClause = {
        expressions: ['status', 'category'],
        rollup: true,
      };

      const result = QueryBuilder.from('public', 'orders')
        .groupBy(groupByClause)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('GROUP BY ROLLUP(status, category)');
    });

    it('should handle GROUP BY with CUBE', () => {
      const groupByClause: GroupByClause = {
        expressions: ['region', 'product_type'],
        cube: true,
      };

      const result = QueryBuilder.from('public', 'sales')
        .groupBy(groupByClause)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('GROUP BY CUBE(region, product_type)');
    });

    it('should work without GROUP BY', () => {
      const result = QueryBuilder.from('public', 'users')
        .select({ columns: [{ expression: 'id' }] })
        .build();

      expect(result.sql).not.toContain('GROUP BY');
    });
  });

  describe('ORDER BY Clause', () => {
    it('should handle single ORDER BY column', () => {
      const orderByExpressions: OrderByExpression[] = [
        { expression: 'created_at', direction: 'DESC' },
      ];

      const result = QueryBuilder.from('public', 'posts')
        .orderBy(orderByExpressions)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('ORDER BY created_at DESC');
    });

    it('should handle multiple ORDER BY columns', () => {
      const orderByExpressions: OrderByExpression[] = [
        { expression: 'category', direction: 'ASC' },
        { expression: 'price', direction: 'DESC' },
        { expression: 'name', direction: 'ASC' },
      ];

      const result = QueryBuilder.from('public', 'products')
        .orderBy(orderByExpressions)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain(
        'ORDER BY category ASC, price DESC, name ASC',
      );
    });

    it('should handle complex ORDER BY expressions', () => {
      const orderByExpressions: OrderByExpression[] = [
        { expression: 'COUNT(*)', direction: 'DESC' },
        { expression: "DATE_TRUNC('day', created_at)", direction: 'ASC' },
      ];

      const result = QueryBuilder.from('public', 'events')
        .orderBy(orderByExpressions)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain(
        "ORDER BY COUNT(*) DESC, DATE_TRUNC('day', created_at) ASC",
      );
    });

    it('should work without ORDER BY', () => {
      const result = QueryBuilder.from('public', 'users').build();

      expect(result.sql).not.toContain('ORDER BY');
    });
  });

  describe('JOIN Operations', () => {
    it('should handle single INNER JOIN', () => {
      const joinClauses: JoinClause[] = [
        {
          type: 'INNER',
          table: { schema: 'public', table: 'profiles' },
          condition: 'users.id = profiles.user_id',
        },
      ];

      const result = QueryBuilder.from('public', 'users')
        .joins(joinClauses)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain(
        'INNER JOIN "public"."profiles" ON users.id = profiles.user_id',
      );
    });

    it('should handle multiple JOINs of different types', () => {
      const joinClauses: JoinClause[] = [
        {
          type: 'INNER',
          table: { schema: 'public', table: 'orders' },
          condition: 'users.id = orders.user_id',
        },
        {
          type: 'LEFT',
          table: { schema: 'public', table: 'addresses' },
          condition: 'users.address_id = addresses.id',
        },
        {
          type: 'RIGHT',
          table: { schema: 'public', table: 'preferences' },
          condition: 'users.id = preferences.user_id',
        },
      ];

      const result = QueryBuilder.from('public', 'users')
        .joins(joinClauses)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain(
        'INNER JOIN "public"."orders" ON users.id = orders.user_id',
      );
      expect(sqlString).toContain(
        'LEFT JOIN "public"."addresses" ON users.address_id = addresses.id',
      );
      expect(sqlString).toContain(
        'RIGHT JOIN "public"."preferences" ON users.id = preferences.user_id',
      );
    });

    it('should handle schema-less JOINs', () => {
      const joinClauses: JoinClause[] = [
        {
          type: 'LEFT',
          table: { schema: '', table: 'user_stats' },
          condition: 'users.id = user_stats.user_id',
        },
      ];

      const result = QueryBuilder.from('public', 'users')
        .joins(joinClauses)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain(
        'LEFT JOIN "public"."user_stats" ON users.id = user_stats.user_id',
      );
    });

    it('should work without JOINs', () => {
      const result = QueryBuilder.from('public', 'users').build();

      expect(result.sql).not.toContain('JOIN');
    });
  });

  describe('LIMIT and OFFSET', () => {
    it('should handle LIMIT only', () => {
      const result = QueryBuilder.from('public', 'users').limit(25).build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toMatch(/LIMIT (?:\$\d+|25)/);
      expect(result.sql).not.toContain('OFFSET');
    });

    it('should handle LIMIT with OFFSET', () => {
      const result = QueryBuilder.from('public', 'products')
        .limit(50, 100)
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toMatch(/LIMIT (?:\$\d+|50)/);
      expect(sqlString).toMatch(/OFFSET (?:\$\d+|100)/);
    });

    it('should omit OFFSET when it is 0', () => {
      const result = QueryBuilder.from('public', 'items').limit(20, 0).build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toMatch(/LIMIT (?:\$\d+|20)/);
      expect(result.sql).not.toContain('OFFSET');
    });

    it('should include OFFSET when greater than 0', () => {
      const result = QueryBuilder.from('public', 'logs').limit(10, 5).build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toMatch(/LIMIT (?:\$\d+|10)/);
      expect(sqlString).toMatch(/OFFSET (?:\$\d+|5)/);
    });
  });

  describe('Complete SQL Generation', () => {
    it('should generate complex query with all clauses', () => {
      const selectClause: SelectClause = {
        columns: [
          { expression: 'u.id', alias: 'user_id' },
          { expression: 'u.name' },
          { expression: 'p.title' },
          { expression: 'COUNT(c.id)', alias: 'comment_count' },
        ],
      };

      const joinClauses: JoinClause[] = [
        {
          type: 'INNER',
          table: { schema: 'public', table: 'posts' },
          condition: 'u.id = p.author_id',
        },
        {
          type: 'LEFT',
          table: { schema: 'public', table: 'comments' },
          condition: 'p.id = c.post_id',
        },
      ];

      const groupByClause: GroupByClause = {
        expressions: ['u.id', 'u.name', 'p.title'],
      };

      const orderByExpressions: OrderByExpression[] = [
        { expression: 'comment_count', direction: 'DESC' },
        { expression: 'u.name', direction: 'ASC' },
      ];

      const result = QueryBuilder.from('public', 'users', 'u')
        .select(selectClause)
        .joins(joinClauses)
        .whereFilters([
          { column: 'u.is_active', operator: 'eq', value: true },
          { column: 'p.status', operator: 'eq', value: 'published' },
        ])
        .groupBy(groupByClause)
        .orderBy(orderByExpressions)
        .limit(20, 10)
        .build();

      // Verify all parts are included
      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain(
        'SELECT u.id AS "user_id", u.name, p.title, COUNT(c.id) AS "comment_count"',
      );
      expect(sqlString).toContain('FROM "public"."users" "u"');
      expect(sqlString).toContain('INNER JOIN "public"."posts"');
      expect(sqlString).toContain('LEFT JOIN "public"."comments"');
      expect(sqlString).toContain('WHERE');
      expect(sqlString).toContain('u.is_active');
      expect(sqlString).toContain('p.status');
      expect(sqlString).toContain('GROUP BY u.id, u.name, p.title');
      expect(sqlString).toContain('ORDER BY comment_count DESC, u.name ASC');
      expect(sqlString).toMatch(/LIMIT (?:\$\d+|20)/);
      expect(sqlString).toMatch(/OFFSET (?:\$\d+|10)/);
    });

    it('should maintain proper SQL clause order', () => {
      const result = QueryBuilder.from('public', 'test')
        .limit(5)
        .orderBy([{ expression: 'id', direction: 'ASC' }])
        .whereFilters([{ column: 'status', operator: 'eq', value: 'active' }])
        .select({ columns: [{ expression: 'id' }, { expression: 'name' }] })
        .groupBy({ expressions: ['status'] })
        .build();

      // Despite method call order, SQL should follow proper clause order
      const { sql } = sqlToString(result.sql);
      const selectPos = sql.indexOf('SELECT');
      const fromPos = sql.indexOf('FROM');
      const wherePos = sql.indexOf('WHERE');
      const groupPos = sql.indexOf('GROUP BY');
      const orderPos = sql.indexOf('ORDER BY');
      const limitPos = sql.indexOf('LIMIT');

      expect(selectPos).toBeLessThan(fromPos);
      expect(fromPos).toBeLessThan(wherePos);
      expect(wherePos).toBeLessThan(groupPos);
      expect(groupPos).toBeLessThan(orderPos);
      expect(orderPos).toBeLessThan(limitPos);
    });
  });

  describe('Query Metadata', () => {
    it('should include metadata in query result', () => {
      const result = QueryBuilder.from('public', 'users')
        .select({ columns: [{ expression: 'COUNT(*)', alias: 'total' }] })
        .build();

      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('queryType');
      expect(result.metadata).toHaveProperty('hasAggregation');
      expect(result.metadata).toHaveProperty('isTimeSeries');
      expect(result.metadata.hasAggregation).toBe(true);
      expect(result.metadata.isTimeSeries).toBe(false);
    });

    it('should detect aggregation queries', () => {
      const result = QueryBuilder.from('public', 'orders')
        .select({
          columns: [
            { expression: 'status' },
            { expression: 'COUNT(*)', alias: 'count' },
          ],
        })
        .groupBy({ expressions: ['status'] })
        .build();

      expect(result.metadata.hasAggregation).toBe(true);
      expect(result.metadata.queryType).toBe('AGGREGATE');
    });

    it('should detect time series queries', () => {
      const result = QueryBuilder.from('public', 'events')
        .select({
          columns: [
            { expression: "DATE_TRUNC('day', created_at)", alias: 'day' },
            { expression: 'COUNT(*)', alias: 'events' },
          ],
        })
        .groupBy({ expressions: ["DATE_TRUNC('day', created_at)"] })
        .build();

      expect(result.metadata.isTimeSeries).toBe(true);
      expect(result.metadata.queryType).toBe('TIME_SERIES');
    });

    it('should detect simple SELECT queries', () => {
      const result = QueryBuilder.from('public', 'users')
        .select({
          columns: [
            { expression: 'id' },
            { expression: 'name' },
            { expression: 'email' },
          ],
        })
        .build();

      expect(result.metadata.hasAggregation).toBe(false);
      expect(result.metadata.isTimeSeries).toBe(false);
      expect(result.metadata.queryType).toBe('SELECT');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty table name gracefully', () => {
      const result = QueryBuilder.from('public', '').build();

      // Should still generate FROM clause
      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('FROM');
    });

    it('should handle special characters in identifiers', () => {
      const result = QueryBuilder.from('public', 'user-events_v2')
        .select({
          columns: [{ expression: 'event-id' }, { expression: 'user_name#' }],
        })
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('user-events_v2');
      expect(sqlString).toContain('event-id');
      expect(sqlString).toContain('user_name#');
    });

    it('should handle null and undefined values appropriately', () => {
      const result = QueryBuilder.from('public', 'test')
        .whereFilters([
          { column: 'nullable_field', operator: 'eq', value: null },
          {
            column: 'optional_field',
            operator: 'neq',
            value: 'undefined' as any,
          },
        ])
        .build();

      const { sql: sqlString } = sqlToString(result.sql);
      expect(sqlString).toContain('WHERE');
    });

    it('should return empty parameters array when no parameterization', () => {
      const result = QueryBuilder.from('public', 'simple').build();

      const { params } = sqlToString(result.sql);
      expect(params).toEqual([]);
    });
  });
});
