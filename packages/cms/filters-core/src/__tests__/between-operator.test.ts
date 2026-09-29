import { describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { FilterBuilder } from '../filter-builder';
import { parsePropertiesToFilters } from '../utils/properties-parser';

describe('Between operator handling', () => {
  const mockColumns: ColumnMetadata[] = [
    {
      name: 'sort_order',
      ui_config: { data_type: 'integer' },
      is_nullable: false,
      is_primary_key: false,
      is_unique: false,
      is_searchable: false,
      is_sortable: true,
      is_filterable: true,
    },
    {
      name: 'price',
      ui_config: { data_type: 'numeric' },
      is_nullable: false,
      is_primary_key: false,
      is_unique: false,
      is_searchable: false,
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
  ];

  describe('parsePropertiesToFilters', () => {
    it('should parse comma-separated string values for between operator', () => {
      const properties = {
        'sort_order.between': '1,10',
      };

      const result = parsePropertiesToFilters(properties, mockColumns);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        column: 'sort_order',
        operator: 'between',
        value: ['1', '10'],
      });
    });

    it('should handle array values for between operator', () => {
      const properties = {
        'price.between': [10, 100],
      };

      const result = parsePropertiesToFilters(properties, mockColumns);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        column: 'price',
        operator: 'between',
        value: [10, 100],
      });
    });

    it('should parse comma-separated string values for notBetween operator', () => {
      const properties = {
        'sort_order.notBetween': '5,15',
      };

      const result = parsePropertiesToFilters(properties, mockColumns);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        column: 'sort_order',
        operator: 'notBetween',
        value: ['5', '15'],
      });
    });

    it('should handle single values for between operator (no comma)', () => {
      const properties = {
        'sort_order.between': '10',
      };

      const result = parsePropertiesToFilters(properties, mockColumns);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        column: 'sort_order',
        operator: 'between',
        value: '10', // Single value remains as-is (will be handled/validated by FilterBuilder)
      });
    });
  });

  describe('FilterBuilder validation', () => {
    it('should validate and process between operator with array from parsed string', () => {
      const filterBuilder = new FilterBuilder({
        serviceType: 'data-explorer',
        columns: mockColumns,
        escapeStrategy: 'drizzle',
      });

      const filter = {
        column: 'sort_order',
        operator: 'between',
        value: ['1', '10'], // String values from parsed comma-separated string
      };

      const validation = filterBuilder.validateFilter(filter);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);

      const whereClause = filterBuilder.buildWhere([filter]);
      expect(whereClause).toContain('BETWEEN');
      expect(whereClause).toContain('1');
      expect(whereClause).toContain('10');
    });

    it('should validate and process notBetween operator with array from parsed string', () => {
      const filterBuilder = new FilterBuilder({
        serviceType: 'data-explorer',
        columns: mockColumns,
        escapeStrategy: 'drizzle',
      });

      const filter = {
        column: 'price',
        operator: 'notBetween',
        value: ['10.5', '100.99'], // String values from parsed comma-separated string
      };

      const validation = filterBuilder.validateFilter(filter);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);

      const whereClause = filterBuilder.buildWhere([filter]);
      expect(whereClause).toContain('NOT BETWEEN');
      expect(whereClause).toContain('10.5');
      expect(whereClause).toContain('100.99');
    });
  });
});
