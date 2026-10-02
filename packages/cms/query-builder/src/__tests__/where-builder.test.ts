import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { FilterCondition } from '@pymekit/cms-filters-core';

import { WhereBuilder } from '../clauses/where-builder';
import { sqlToString } from './test-helpers';

describe('WhereBuilder', () => {
  describe('relative date filtering', () => {
    // Mock current date to ensure consistent tests
    beforeAll(() => {
      // Set a fixed date for testing: 2024-03-15 12:00:00 UTC
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it('should resolve relative date "lastWeek" with gt operator', () => {
      const filters: FilterCondition[] = [
        {
          column: 'created_at',
          operator: 'gt',
          value: '__rel_date:lastWeek',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);

        // Should resolve to parameterized query
        expect(sqlString).toContain('created_at');
        expect(sqlString).toContain('>');
        expect(sqlString).toContain('$1'); // Parameterized value
        expect(sqlString).not.toContain('__rel_date');
      }
    });

    it('should resolve relative date "lastWeek" with eq operator as BETWEEN', () => {
      const filters: FilterCondition[] = [
        {
          column: 'created_at',
          operator: 'eq',
          value: '__rel_date:lastWeek',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);

        // Should use BETWEEN for the entire week range
        expect(sqlString).toContain('created_at');
        expect(sqlString).toContain('BETWEEN');
        expect(sqlString).toContain('$1'); // Parameterized start
        expect(sqlString).toContain('$2'); // Parameterized end
        expect(sqlString).not.toContain('__rel_date');
      }
    });

    it('should resolve relative date "today" with different operators', () => {
      const testCases = [
        { operator: 'gt', expectedOp: '>', boundary: 'end' },
        { operator: 'gte', expectedOp: '>=', boundary: 'start' },
        { operator: 'lt', expectedOp: '<', boundary: 'start' },
        { operator: 'lte', expectedOp: '<=', boundary: 'end' },
      ];

      testCases.forEach(({ operator, expectedOp, boundary }) => {
        const filters: FilterCondition[] = [
          {
            column: 'created_at',
            operator,
            value: '__rel_date:today',
          },
        ];

        const whereClause = WhereBuilder.fromFilters(filters);
        expect(whereClause).not.toBeNull();

        if (whereClause) {
          const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);

          expect(sqlString).toContain('created_at');
          expect(sqlString).toContain(expectedOp);
          expect(sqlString).toContain('$1'); // Parameterized value
          expect(sqlString).not.toContain('__rel_date');
        }
      });
    });

    it('should resolve relative date "last30Days" correctly', () => {
      const filters: FilterCondition[] = [
        {
          column: 'created_at',
          operator: 'eq',
          value: '__rel_date:last30Days',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);

        // Should use BETWEEN for 30 days range
        expect(sqlString).toContain('created_at');
        expect(sqlString).toContain('BETWEEN');
        expect(sqlString).toContain('$1'); // Parameterized start
        expect(sqlString).toContain('$2'); // Parameterized end
        expect(sqlString).not.toContain('__rel_date');
      }
    });

    it('should handle multiple filters with relative dates', () => {
      const filters: FilterCondition[] = [
        {
          column: 'created_at',
          operator: 'gte',
          value: '__rel_date:lastMonth',
        },
        {
          column: 'updated_at',
          operator: 'lt',
          value: '__rel_date:today',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        expect(whereClause.conditions).toHaveLength(2);

        const { sql: createdAtSql } = sqlToString(whereClause.conditions[0]!);
        const { sql: updatedAtSql } = sqlToString(whereClause.conditions[1]!);

        // First condition: created_at >= parameterized value
        expect(createdAtSql).toContain('created_at');
        expect(createdAtSql).toContain('>=');
        expect(createdAtSql).toContain('$1'); // Parameterized value

        // Second condition: updated_at < parameterized value
        expect(updatedAtSql).toContain('updated_at');
        expect(updatedAtSql).toContain('<');
        expect(updatedAtSql).toContain('$1'); // Parameterized value

        // No unresolved relative dates
        expect(createdAtSql).not.toContain('__rel_date');
        expect(updatedAtSql).not.toContain('__rel_date');
      }
    });

    it('should handle date-specific operators with relative dates', () => {
      const dateOperators = [
        'before',
        'after',
        'beforeOrOn',
        'afterOrOn',
        'during',
      ];

      dateOperators.forEach((operator) => {
        const filters: FilterCondition[] = [
          {
            column: 'created_at',
            operator,
            value: '__rel_date:thisWeek',
          },
        ];

        const whereClause = WhereBuilder.fromFilters(filters);
        expect(whereClause).not.toBeNull();

        if (whereClause) {
          const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);

          // Should not contain unresolved relative date
          expect(sqlString).not.toContain('__rel_date');
          expect(sqlString).toContain('created_at');

          // Check for either parameterized values or resolved dates
          const hasParams = /\$\d/.test(sqlString);
          const hasDates = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(
            sqlString,
          );
          expect(hasParams || hasDates).toBe(true);
        }
      });
    });

    it('should handle non-date columns with regular values', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
        },
        {
          column: 'count',
          operator: 'gt',
          value: 10,
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: statusSql } = sqlToString(whereClause.conditions[0]!);
        const { sql: countSql } = sqlToString(whereClause.conditions[1]!);

        expect(statusSql).toContain('status');
        expect(statusSql).toContain('=');
        expect(statusSql).toContain('$1'); // Parameterized value

        expect(countSql).toContain('count');
        expect(countSql).toContain('>');
        expect(countSql).toContain('$1'); // Parameterized value
      }
    });
  });

  // Regresión F2.6b: un código con dígitos y guiones no es una fecha.
  describe('detección de fechas', () => {
    it('no convierte en rango de fechas un texto como PED-2026-0001', () => {
      const whereClause = WhereBuilder.fromFilters([
        { column: 'order_number', operator: 'eq', value: 'PED-2026-0001' },
      ]);

      const { sql: sqlString, params } = sqlToString(
        whereClause!.conditions[0]!,
      );

      expect(sqlString).not.toContain('BETWEEN');
      expect(sqlString).toContain('=');
      expect(params).toContain('PED-2026-0001');
    });

    it('sigue tratando una fecha ISO como el día completo', () => {
      const whereClause = WhereBuilder.fromFilters([
        { column: 'created_at', operator: 'eq', value: '2026-01-15' },
      ]);

      const { sql: sqlString } = sqlToString(whereClause!.conditions[0]!);

      expect(sqlString).toContain('BETWEEN');
    });
  });

  describe('standard filtering operations', () => {
    it('should handle IN operator with arrays', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'in',
          value: ['active', 'pending', 'draft'],
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);
        expect(sqlString).toContain('status');
        expect(sqlString).toContain('IN');
        expect(sqlString).toMatch(/\$\d/); // Should have parameterized values
      }
    });

    it('should handle NULL checks', () => {
      const filters: FilterCondition[] = [
        {
          column: 'deleted_at',
          operator: 'isNull',
          value: true,
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);
        expect(sqlString).toContain('deleted_at');
        expect(sqlString).toContain('IS NULL');
      }
    });

    it('should handle text search operators', () => {
      const textOperators = [
        { operator: 'contains', pattern: '%test%' },
        { operator: 'startsWith', pattern: 'test%' },
        { operator: 'endsWith', pattern: '%test' },
      ];

      textOperators.forEach(({ operator, pattern }) => {
        const filters: FilterCondition[] = [
          {
            column: 'name',
            operator,
            value: 'test',
          },
        ];

        const whereClause = WhereBuilder.fromFilters(filters);
        expect(whereClause).not.toBeNull();

        if (whereClause) {
          const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);
          expect(sqlString).toContain('name');
          expect(sqlString).toContain('ILIKE');
          expect(sqlString).toContain('$1'); // Parameterized value
        }
      });
    });

    it('should handle BETWEEN with comma-separated values', () => {
      const filters: FilterCondition[] = [
        {
          column: 'price',
          operator: 'between',
          value: '10,100',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);
        expect(sqlString).toContain('price');
        expect(sqlString).toContain('BETWEEN');
        expect(sqlString).toContain('$1'); // Parameterized start
        expect(sqlString).toContain('$2'); // Parameterized end
      }
    });
  });

  describe('complex filter combinations', () => {
    it('should combine filters with AND by default', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
        },
        {
          column: 'created_at',
          operator: 'gte',
          value: '__rel_date:lastWeek',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        expect(whereClause.combineWith).toBe('AND');
        expect(whereClause.conditions).toHaveLength(2);
      }
    });

    it('should handle OR combination when specified', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
        },
        {
          column: 'priority',
          operator: 'eq',
          value: 'high',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters, 'OR');
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        expect(whereClause.combineWith).toBe('OR');
        expect(whereClause.conditions).toHaveLength(2);
      }
    });
  });
});
