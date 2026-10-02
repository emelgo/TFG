import { describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { parsePropertiesToFilters } from '../utils/properties-parser';

describe('parsePropertiesToFilters', () => {
  const mockColumns: ColumnMetadata[] = [
    {
      name: 'id',
      ui_config: { data_type: 'integer' },
      is_nullable: false,
      is_primary_key: true,
      is_unique: true,
      is_searchable: false,
      is_sortable: true,
      is_filterable: true,
    },
    {
      name: 'name',
      ui_config: { data_type: 'text' },
      is_nullable: false,
      is_primary_key: false,
      is_unique: false,
      is_searchable: true,
      is_sortable: true,
      is_filterable: true,
    },
    {
      name: 'created_at',
      ui_config: { data_type: 'timestamp with time zone' },
      is_nullable: false,
      is_primary_key: false,
      is_unique: false,
      is_searchable: false,
      is_sortable: true,
      is_filterable: true,
    },
    {
      name: 'is_active',
      ui_config: { data_type: 'boolean' },
      is_nullable: true,
      is_primary_key: false,
      is_unique: false,
      is_searchable: false,
      is_sortable: true,
      is_filterable: true,
    },
  ];

  describe('basic functionality', () => {
    it('should return empty array for empty properties', () => {
      const result = parsePropertiesToFilters({}, mockColumns);
      expect(result).toEqual([]);
    });

    it('should return empty array for null/undefined properties', () => {
      expect(parsePropertiesToFilters(null as any, mockColumns)).toEqual([]);
      expect(parsePropertiesToFilters(undefined as any, mockColumns)).toEqual(
        [],
      );
    });

    it('should skip undefined and null values', () => {
      const properties = {
        'name.equals': 'test',
        'id.equals': undefined,
        'created_at.equals': null,
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        column: 'name',
        operator: 'eq',
        value: 'test',
      });
    });

    it('should skip special keys like "columns"', () => {
      const properties = {
        'name.equals': 'test',
        columns: ['name', 'id'],
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(1);
      expect(result[0].column).toBe('name');
    });
  });

  describe('operator mapping', () => {
    it('should map human-readable operators to internal operators', () => {
      const properties = {
        'name.equals': 'test',
        'id.greaterThan': 5,
        'id.lessThanOrEqual': 10,
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(3);

      expect(result.find((f) => f.column === 'name')?.operator).toBe('eq');
      expect(
        result.find((f) => f.column === 'id' && f.value === 5)?.operator,
      ).toBe('gt');
      expect(
        result.find((f) => f.column === 'id' && f.value === 10)?.operator,
      ).toBe('lte');
    });

    it('should handle operators that are already internal names', () => {
      const properties = {
        'name.eq': 'test',
        'id.gte': 5,
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(2);

      expect(result.find((f) => f.column === 'name')?.operator).toBe('eq');
      expect(result.find((f) => f.column === 'id')?.operator).toBe('gte');
    });

    it('should default to "eq" for unknown operators', () => {
      const properties = {
        'name.unknownOp': 'test',
        name: 'no-operator',
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(2);

      expect(result[0].operator).toBe('eq');
      expect(result[1].operator).toBe('eq');
    });
  });

  describe('null value handling', () => {
    it('should convert string "true" to boolean true for null operators', () => {
      const properties = {
        'name.isNull': 'true',
        'is_active.notNull': 'true',
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(2);

      expect(result.find((f) => f.operator === 'isNull')?.value).toBe(true);
      expect(result.find((f) => f.operator === 'notNull')?.value).toBe(true);
    });

    it('should not convert non-"true" values for null operators', () => {
      const properties = {
        'name.isNull': 'false',
        'is_active.notNull': 1,
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(2);

      expect(result.find((f) => f.operator === 'isNull')?.value).toBe('false');
      expect(result.find((f) => f.operator === 'notNull')?.value).toBe(1);
    });
  });

  describe('validation', () => {
    it('should throw error for non-existent columns', () => {
      const properties = {
        'nonexistent.equals': 'test',
      };

      expect(() => parsePropertiesToFilters(properties, mockColumns)).toThrow(
        "Column 'nonexistent' not found in table metadata",
      );
    });

    it('should provide context in error messages', () => {
      const properties = {
        'nonexistent.equals': 'test',
      };

      expect(() => parsePropertiesToFilters(properties, mockColumns)).toThrow(
        "Failed to parse filter for 'nonexistent.equals'",
      );
    });

    it('should skip malformed keys gracefully', () => {
      const properties = {
        '': 'empty-key',
        '.equals': 'no-column',
        'name.equals': 'valid',
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(1);
      expect(result[0].column).toBe('name');
    });
  });

  describe('comprehensive operator mapping', () => {
    const operatorTests = [
      ['equals', 'eq'],
      ['notEquals', 'neq'],
      ['greaterThan', 'gt'],
      ['greaterThanOrEqual', 'gte'],
      ['lessThan', 'lt'],
      ['lessThanOrEqual', 'lte'],
      ['contains', 'contains'],
      ['startsWith', 'startsWith'],
      ['endsWith', 'endsWith'],
      ['in', 'in'],
      ['notIn', 'notIn'],
      ['isNull', 'isNull'],
      ['notNull', 'notNull'],
    ];

    operatorTests.forEach(([input, expected]) => {
      it(`should map ${input} to ${expected}`, () => {
        const properties = {
          [`name.${input}`]: 'test',
        };

        const result = parsePropertiesToFilters(properties, mockColumns);
        expect(result).toHaveLength(1);
        expect(result[0].operator).toBe(expected);
      });
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple filters correctly', () => {
      const properties = {
        'name.contains': 'test',
        'id.greaterThan': 5,
        'is_active.isNull': 'true',
        'created_at.lessThan': '2024-01-01',
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(4);

      const nameFilter = result.find((f) => f.column === 'name');
      expect(nameFilter).toEqual({
        column: 'name',
        operator: 'contains',
        value: 'test',
      });

      const idFilter = result.find((f) => f.column === 'id');
      expect(idFilter).toEqual({
        column: 'id',
        operator: 'gt',
        value: 5,
      });

      const activeFilter = result.find((f) => f.column === 'is_active');
      expect(activeFilter).toEqual({
        column: 'is_active',
        operator: 'isNull',
        value: true,
      });

      const dateFilter = result.find((f) => f.column === 'created_at');
      expect(dateFilter).toEqual({
        column: 'created_at',
        operator: 'lt',
        value: '2024-01-01',
      });
    });

    it('should preserve original values for non-null operators', () => {
      const properties = {
        'name.equals': 'hello world',
        'id.in': [1, 2, 3],
        'is_active.equals': false,
        'created_at.greaterThan': new Date('2024-01-01'),
      };

      const result = parsePropertiesToFilters(properties, mockColumns);
      expect(result).toHaveLength(4);

      expect(result.find((f) => f.column === 'name')?.value).toBe(
        'hello world',
      );
      expect(result.find((f) => f.column === 'id')?.value).toEqual([1, 2, 3]);
      expect(result.find((f) => f.column === 'is_active')?.value).toBe(false);
      expect(
        result.find((f) => f.column === 'created_at')?.value,
      ).toBeInstanceOf(Date);
    });
  });
});
