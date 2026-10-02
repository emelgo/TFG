import { describe, expect, it } from 'vitest';

import type { FilterCondition } from '@pymekit/cms-filters-core';

import { WhereBuilder } from '../clauses/where-builder';
import { sqlToString } from './test-helpers';

describe('JSON operators in WhereBuilder', () => {
  describe('containsText operator', () => {
    it('should cast JSON column to text and use ILIKE', () => {
      const filters: FilterCondition[] = [
        {
          column: 'preferences',
          operator: 'containsText',
          value: 'lalala',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);

        // The SQL should contain type casting and ILIKE
        expect(sqlString).toContain('::text');
        expect(sqlString).toContain('ILIKE');
        expect(sqlString).toContain('$1'); // Parameterized value
      }
    });

    it('should handle special characters in search text', () => {
      const filters: FilterCondition[] = [
        {
          column: 'metadata',
          operator: 'containsText',
          value: "test'value",
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);
        expect(sqlString).toContain('::text');
        expect(sqlString).toContain('ILIKE');
      }
    });
  });

  describe('other JSON operators', () => {
    it('should handle hasKey operator', () => {
      const filters: FilterCondition[] = [
        {
          column: 'preferences',
          operator: 'hasKey',
          value: 'language',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);
        expect(sqlString).toContain('?');
        expect(sqlString).toContain('$1');
      }
    });

    it('should handle keyEquals operator', () => {
      const filters: FilterCondition[] = [
        {
          column: 'preferences',
          operator: 'keyEquals',
          value: ['language', 'en-US'],
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);
        expect(sqlString).toContain('>>');
        expect(sqlString).toContain('$1');
        expect(sqlString).toContain('$2');
      }
    });

    it('should handle pathExists operator', () => {
      const filters: FilterCondition[] = [
        {
          column: 'metadata',
          operator: 'pathExists',
          value: 'user.profile.email',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);
        expect(sqlString).toContain('#>');
        expect(sqlString).toContain('IS NOT NULL');
      }
    });
  });

  describe('regular contains vs containsText', () => {
    it('should NOT cast for regular contains operator', () => {
      const filters: FilterCondition[] = [
        {
          column: 'name',
          operator: 'contains',
          value: 'test',
        },
      ];

      const whereClause = WhereBuilder.fromFilters(filters);
      expect(whereClause).not.toBeNull();

      if (whereClause) {
        const { sql: sqlString } = sqlToString(whereClause.conditions[0]!);
        expect(sqlString).not.toContain('::text');
        expect(sqlString).toContain('ILIKE');
        expect(sqlString).toContain('$1');
      }
    });
  });
});
