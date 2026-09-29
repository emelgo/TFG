import { describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { FilterBuilder } from '../filter-builder';
import { parsePropertiesToFilters } from '../utils/properties-parser';

describe('Comprehensive edge case handling', () => {
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
      name: 'tags',
      ui_config: { data_type: 'text[]' },
      is_nullable: true,
      is_primary_key: false,
      is_unique: false,
      is_searchable: false,
      is_sortable: false,
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
    {
      name: 'metadata',
      ui_config: { data_type: 'jsonb' },
      is_nullable: true,
      is_primary_key: false,
      is_unique: false,
      is_searchable: false,
      is_sortable: false,
      is_filterable: true,
    },
  ];

  describe('Operator variations', () => {
    it('should handle all operator aliases', () => {
      const operatorVariations = {
        'name.equals': 'test',
        'name.eq': 'test2',
        'price.greaterThan': 100,
        'price.gt': 200,
        'price.lessThanOrEqual': 500,
        'price.lte': 600,
        'is_active.isnull': 'true',
        'is_active.isNull': 'true',
        'metadata.isNotNull': 'true',
        'metadata.notnull': 'true',
      };

      const filters = parsePropertiesToFilters(operatorVariations, mockColumns);

      // Check that aliases map to correct internal operators
      expect(
        filters.find((f) => f.column === 'name' && f.value === 'test')
          ?.operator,
      ).toBe('eq');
      expect(
        filters.find((f) => f.column === 'name' && f.value === 'test2')
          ?.operator,
      ).toBe('eq');
      expect(
        filters.find((f) => f.column === 'price' && f.value === 100)?.operator,
      ).toBe('gt');
      expect(
        filters.find((f) => f.column === 'price' && f.value === 200)?.operator,
      ).toBe('gt');
      expect(
        filters.find((f) => f.column === 'price' && f.value === 500)?.operator,
      ).toBe('lte');
      expect(
        filters.find((f) => f.column === 'price' && f.value === 600)?.operator,
      ).toBe('lte');
      expect(filters.filter((f) => f.operator === 'isNull')).toHaveLength(2);
      expect(filters.filter((f) => f.operator === 'notNull')).toHaveLength(2);
    });

    it('should handle case-insensitive operators', () => {
      const properties = {
        'name.EQUALS': 'test',
        'price.GreaterThan': 100,
        'is_active.IsNull': 'true',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters).toHaveLength(3);
      expect(filters[0].operator).toBe('eq');
      expect(filters[1].operator).toBe('gt');
      expect(filters[2].operator).toBe('isNull');
    });
  });

  describe('Between operator edge cases', () => {
    it('should handle comma-separated strings', () => {
      const properties = {
        'price.between': '10,100',
        'id.between': '1, 50', // with spaces
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].value).toEqual(['10', '100']);
      expect(filters[1].value).toEqual(['1', '50']);
    });

    it('should handle array values', () => {
      const properties = {
        'price.between': [10, 100],
        'created_at.between': ['2024-01-01', '2024-12-31'],
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].value).toEqual([10, 100]);
      expect(filters[1].value).toEqual(['2024-01-01', '2024-12-31']);
    });

    it('should handle single values gracefully', () => {
      const properties = {
        'price.between': '100', // Single value, no comma
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      // Should keep as-is and let validation handle it
      expect(filters[0].value).toBe('100');
    });

    it('should handle notBetween with same variations', () => {
      const properties = {
        'price.notBetween': '10,100',
        'id.notBetween': [1, 50],
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].operator).toBe('notBetween');
      expect(filters[0].value).toEqual(['10', '100']);
      expect(filters[1].operator).toBe('notBetween');
      expect(filters[1].value).toEqual([1, 50]);
    });
  });

  describe('IN/NOT IN operator edge cases', () => {
    it('should handle comma-separated strings', () => {
      const properties = {
        'name.in': 'foo,bar,baz',
        'tags.in': 'tag1, tag2, tag3', // with spaces
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].value).toEqual(['foo', 'bar', 'baz']);
      expect(filters[1].value).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle JSON array strings', () => {
      const properties = {
        'name.in': '["foo","bar","baz"]',
        'id.in': '[1,2,3]',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].value).toEqual(['foo', 'bar', 'baz']);
      expect(filters[1].value).toEqual([1, 2, 3]);
    });

    it('should handle array values', () => {
      const properties = {
        'name.in': ['foo', 'bar'],
        'id.in': [1, 2, 3],
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].value).toEqual(['foo', 'bar']);
      expect(filters[1].value).toEqual([1, 2, 3]);
    });

    it('should wrap single values in array', () => {
      const properties = {
        'name.in': 'single',
        'id.in': 42,
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].value).toEqual(['single']);
      expect(filters[1].value).toEqual([42]);
    });

    it('should handle notIn with same variations', () => {
      const properties = {
        'name.notIn': 'foo,bar',
        'id.notIn': [1, 2],
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].operator).toBe('notIn');
      expect(filters[0].value).toEqual(['foo', 'bar']);
      expect(filters[1].operator).toBe('notIn');
      expect(filters[1].value).toEqual([1, 2]);
    });
  });

  describe('Null operator edge cases', () => {
    it('should handle various true values', () => {
      const properties = {
        'name.isNull': 'true',
        'price.isNull': true,
        'tags.isNull': 'TRUE',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].operator).toBe('isNull');
      expect(filters[0].value).toBe(true); // 'true' string converts to boolean
      expect(filters[1].operator).toBe('isNull');
      expect(filters[1].value).toBe(true); // boolean stays as-is
      expect(filters[2].operator).toBe('isNull');
      expect(filters[2].value).toBe(true); // 'TRUE' string converts to boolean
    });

    it('should handle false and other values', () => {
      const properties = {
        'name.isNull': 'false',
        'price.isNull': false,
        'metadata.isNull': 1,
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      // Per backward compatibility, only 'true' string is converted
      expect(filters[0].value).toBe('false'); // string 'false' stays as string
      expect(filters[1].value).toBe(false); // boolean false stays as-is
      expect(filters[2].value).toBe(1); // number stays as-is
    });

    it('should handle notNull variations', () => {
      const properties = {
        'name.notNull': 'true',
        'price.notnull': 'true',
        'tags.isNotNull': 'true',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      filters.forEach((f) => {
        expect(f.operator).toBe('notNull');
      });
    });
  });

  describe('Date operator edge cases', () => {
    it('should handle during operator like between', () => {
      const properties = {
        'created_at.during': '2024-01-01,2024-12-31',
        'created_at.before': '2024-01-01',
        'created_at.after': '2024-12-31',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].operator).toBe('during');
      expect(filters[0].value).toEqual(['2024-01-01', '2024-12-31']);
      expect(filters[1].operator).toBe('before');
      expect(filters[2].operator).toBe('after');
    });
  });

  describe('JSON operator edge cases', () => {
    it('should handle keyEquals with key:value format', () => {
      const properties = {
        'metadata.keyEquals': 'status:active',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].operator).toBe('keyEquals');
      expect(filters[0].value).toBe('status:active');
    });

    it('should handle keyEquals with JSON object string', () => {
      const properties = {
        'metadata.keyEquals': '{"status":"active"}',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].operator).toBe('keyEquals');
      expect(filters[0].value).toBe('{"status":"active"}');
    });

    it('should handle hasKey operator', () => {
      const properties = {
        'metadata.hasKey': 'status',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].operator).toBe('hasKey');
      expect(filters[0].value).toBe('status');
    });
  });

  describe('FilterBuilder validation with edge cases', () => {
    const filterBuilder = new FilterBuilder({
      serviceType: 'data-explorer',
      columns: mockColumns,
      escapeStrategy: 'drizzle',
    });

    it('should validate all processed filters without errors', () => {
      const properties = {
        'name.in': 'foo,bar',
        'price.between': '10,100',
        'is_active.isNull': 'true',
        'tags.notIn': ['tag1', 'tag2'],
        'created_at.during': '2024-01-01,2024-12-31',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      filters.forEach((filter) => {
        const validation = filterBuilder.validateFilter(filter);
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toEqual([]);
      });
    });

    it('should build valid SQL for all edge cases', () => {
      const properties = {
        'price.between': '10,100',
        'name.in': 'foo,bar,baz',
        'is_active.isNull': 'true',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);
      const whereClause = filterBuilder.buildWhere(filters);

      expect(whereClause).toContain('BETWEEN');
      expect(whereClause).toContain('IN');
      expect(whereClause).toContain('IS NULL');
      expect(whereClause).not.toContain('undefined');
      expect(whereClause).not.toContain('NaN');
    });
  });

  describe('Error handling', () => {
    it('should handle invalid column names gracefully', () => {
      const properties = {
        'invalid_column.equals': 'test',
      };

      expect(() => parsePropertiesToFilters(properties, mockColumns)).toThrow(
        /Column 'invalid_column' not found/,
      );
    });

    it('should handle malformed JSON arrays gracefully', () => {
      const properties = {
        'name.in': '[invalid json',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      // Should fall back to treating as single value
      expect(filters[0].value).toEqual(['[invalid json']);
    });

    it('should handle empty values appropriately', () => {
      const properties = {
        'name.equals': '',
        'price.gt': 0,
        'tags.in': '',
      };

      const filters = parsePropertiesToFilters(properties, mockColumns);

      expect(filters[0].value).toBe('');
      expect(filters[1].value).toBe(0);
      expect(filters[2].value).toEqual(['']);
    });
  });
});
