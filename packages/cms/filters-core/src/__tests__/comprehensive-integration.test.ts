import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { FilterBuilder } from '../filter-builder';
import {
  getOperator,
  getOperatorsForDataType,
} from '../operators/operator-registry';
import type { FilterCondition, FilterHandler } from '../types';
import {
  createRelativeDateValue,
  extractRelativeDateOption,
  getRelativeDateRange,
  isRelativeDate,
  resolveRelativeDate,
} from '../utils/date-utils';

describe('Filters Core - Comprehensive Integration Tests', () => {
  let mockColumns: ColumnMetadata[];
  let filterBuilder: FilterBuilder;

  beforeEach(() => {
    vi.clearAllMocks();

    mockColumns = [
      {
        name: 'id',
        ordering: 1,
        display_name: 'ID',
        description: 'Primary key',
        is_searchable: false,
        is_visible_in_table: true,
        is_visible_in_detail: true,
        default_value: null,
        is_sortable: true,
        is_filterable: true,
        is_editable: false,
        is_primary_key: true,
        is_required: true,
        relations: [],
        ui_config: { data_type: 'integer' },
      },
      {
        name: 'name',
        ordering: 2,
        display_name: 'Name',
        description: 'Item name',
        is_searchable: true,
        is_visible_in_table: true,
        is_visible_in_detail: true,
        default_value: null,
        is_sortable: true,
        is_filterable: true,
        is_editable: true,
        is_primary_key: false,
        is_required: true,
        relations: [],
        ui_config: { data_type: 'text' },
      },
      {
        name: 'price',
        ordering: 3,
        display_name: 'Price',
        description: 'Item price',
        is_searchable: false,
        is_visible_in_table: true,
        is_visible_in_detail: true,
        default_value: null,
        is_sortable: true,
        is_filterable: true,
        is_editable: true,
        is_primary_key: false,
        is_required: false,
        relations: [],
        ui_config: { data_type: 'numeric' },
      },
      {
        name: 'is_active',
        ordering: 4,
        display_name: 'Active',
        description: 'Is item active',
        is_searchable: false,
        is_visible_in_table: true,
        is_visible_in_detail: true,
        default_value: 'true',
        is_sortable: true,
        is_filterable: true,
        is_editable: true,
        is_primary_key: false,
        is_required: false,
        relations: [],
        ui_config: { data_type: 'boolean' },
      },
      {
        name: 'created_at',
        ordering: 5,
        display_name: 'Created At',
        description: 'Creation timestamp',
        is_searchable: false,
        is_visible_in_table: true,
        is_visible_in_detail: true,
        default_value: null,
        is_sortable: true,
        is_filterable: true,
        is_editable: false,
        is_primary_key: false,
        is_required: false,
        relations: [],
        ui_config: { data_type: 'timestamp with time zone' },
      },
      {
        name: 'metadata',
        ordering: 6,
        display_name: 'Metadata',
        description: 'JSON metadata',
        is_searchable: false,
        is_visible_in_table: false,
        is_visible_in_detail: true,
        default_value: null,
        is_sortable: false,
        is_filterable: true,
        is_editable: true,
        is_primary_key: false,
        is_required: false,
        relations: [],
        ui_config: { data_type: 'jsonb' },
      },
      {
        name: 'tags',
        ordering: 7,
        display_name: 'Tags',
        description: 'Item tags',
        is_searchable: false,
        is_visible_in_table: true,
        is_visible_in_detail: true,
        default_value: null,
        is_sortable: false,
        is_filterable: true,
        is_editable: true,
        is_primary_key: false,
        is_required: false,
        relations: [],
        ui_config: { data_type: 'text[]' },
      },
    ];

    filterBuilder = new FilterBuilder({
      serviceType: 'widgets',
      columns: mockColumns,
      escapeStrategy: 'drizzle',
    });
  });

  describe('Complete Operator Coverage', () => {
    it('should support all comparison operators', () => {
      const comparisonOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];

      comparisonOperators.forEach((operator) => {
        const condition: FilterCondition = {
          column: 'price',
          operator,
          value: 100,
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"price"');
        expect(result).toContain('100');
      });
    });

    it('should support all text search operators', () => {
      const textOperators = ['contains', 'startsWith', 'endsWith'];

      textOperators.forEach((operator) => {
        const condition: FilterCondition = {
          column: 'name',
          operator,
          value: 'test',
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"name"');
        expect(result).toContain('ILIKE');
      });
    });

    it('should support array operators', () => {
      const arrayOperators = ['in', 'notIn'];

      arrayOperators.forEach((operator) => {
        const condition: FilterCondition = {
          column: 'name',
          operator,
          value: ['item1', 'item2', 'item3'],
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"name"');
        expect(result).toContain(operator === 'in' ? 'IN' : 'NOT IN');
      });
    });

    it('should support null operators', () => {
      const nullOperators = ['isNull', 'notNull'];

      nullOperators.forEach((operator) => {
        const condition: FilterCondition = {
          column: 'metadata',
          operator,
          value: null,
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"metadata"');
        expect(result).toContain(
          operator === 'isNull' ? 'IS NULL' : 'IS NOT NULL',
        );
      });
    });

    it('should support between operators', () => {
      const betweenOperators = ['between', 'notBetween'];

      betweenOperators.forEach((operator) => {
        const condition: FilterCondition = {
          column: 'price',
          operator,
          value: [10, 100],
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"price"');
        expect(result).toContain(
          operator === 'between' ? 'BETWEEN' : 'NOT BETWEEN',
        );
      });
    });
  });

  describe('Data Type Specific Processing', () => {
    it('should handle integer columns correctly', () => {
      const condition: FilterCondition = {
        column: 'id',
        operator: 'eq',
        value: 123,
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toBe('"id" = 123');
    });

    it('should handle text columns correctly', () => {
      const condition: FilterCondition = {
        column: 'name',
        operator: 'eq',
        value: "test'name",
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toBe("\"name\" = 'test''name'");
    });

    it('should handle boolean columns correctly', () => {
      const condition: FilterCondition = {
        column: 'is_active',
        operator: 'eq',
        value: true,
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toBe('"is_active" = TRUE');
    });

    it('should handle numeric columns correctly', () => {
      const condition: FilterCondition = {
        column: 'price',
        operator: 'gte',
        value: 99.99,
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toBe('"price" >= 99.99');
    });

    it('should handle JSON columns correctly', () => {
      const condition: FilterCondition = {
        column: 'metadata',
        operator: 'eq',
        value: { key: 'value' },
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toContain('"metadata"');
      expect(result).toContain('{"key":"value"}');
    });
  });

  describe('Advanced Date Processing', () => {
    it('should handle all relative date options', () => {
      const relativeDateOptions = [
        'today',
        'yesterday',
        'tomorrow',
        'thisWeek',
        'lastWeek',
        'nextWeek',
        'thisMonth',
        'lastMonth',
        'nextMonth',
        'last7Days',
        'next7Days',
        'last30Days',
        'next30Days',
        'thisYear',
        'lastYear',
      ];

      relativeDateOptions.forEach((option) => {
        const condition: FilterCondition = {
          column: 'created_at',
          operator: 'eq',
          value: createRelativeDateValue(option as 'today'),
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"created_at"');
        expect(result).toContain('BETWEEN');
      });
    });

    it('should handle absolute date equality with range expansion', () => {
      const condition: FilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '2024-01-15',
      };

      const result = filterBuilder.buildCondition(condition);

      // Should convert proper date formats to ranges (preserves dashboard functionality)
      expect(result).toMatch(/^"created_at" BETWEEN '.*' AND '.*'$/);
      expect(result).toContain('2024-01-15');
    });

    it('should handle date range operators', () => {
      const condition: FilterCondition = {
        column: 'created_at',
        operator: 'between',
        value: '__rel_date:thisMonth',
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toContain('BETWEEN');
    });

    it('should handle date comparison operators', () => {
      const dateOperators = ['gt', 'gte', 'lt', 'lte'];

      dateOperators.forEach((operator) => {
        const condition: FilterCondition = {
          column: 'created_at',
          operator,
          value: '__rel_date:today',
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"created_at"');
        // Check for actual SQL operators: gt -> >, gte -> >=, lt -> <, lte -> <=
        const expectedOperator =
          operator === 'gt'
            ? '>'
            : operator === 'gte'
              ? '>='
              : operator === 'lt'
                ? '<'
                : '<=';
        expect(result).toContain(expectedOperator);
      });
    });
  });

  describe('Complex Filter Combinations', () => {
    it('should handle mixed data types in single query', () => {
      const filters: FilterCondition[] = [
        { column: 'id', operator: 'gt', value: 100 },
        { column: 'name', operator: 'contains', value: 'test' },
        { column: 'price', operator: 'between', value: [10, 50] },
        { column: 'is_active', operator: 'eq', value: true },
        { column: 'created_at', operator: 'eq', value: '__rel_date:today' },
      ];

      const result = filterBuilder.buildWhere(filters);

      expect(result).toContain('"id" > 100');
      expect(result).toContain('"name" ILIKE');
      expect(result).toContain('"price" BETWEEN');
      expect(result).toContain('"is_active" = TRUE');
      expect(result).toContain('"created_at" BETWEEN');

      // Should be connected with ANDs between filters
      // Note: BETWEEN clauses have internal ANDs, so total count will be higher
      const andCount = (result.match(/ AND /g) || []).length;
      expect(andCount).toBeGreaterThanOrEqual(4); // At least 4 ANDs between filters
    });

    it('should handle OR logic correctly', () => {
      const filters: FilterCondition[] = [
        {
          column: 'name',
          operator: 'eq',
          value: 'item1',
          logicalOperator: 'OR',
        },
        {
          column: 'name',
          operator: 'eq',
          value: 'item2',
          logicalOperator: 'OR',
        },
        { column: 'name', operator: 'eq', value: 'item3' },
      ];

      const result = filterBuilder.buildWhere(filters);

      expect(result).toContain('OR');
      const orCount = (result.match(/ OR /g) || []).length;
      expect(orCount).toBe(2);
    });

    it('should handle mixed AND/OR logic', () => {
      const filters: FilterCondition[] = [
        { column: 'is_active', operator: 'eq', value: true },
        {
          column: 'name',
          operator: 'eq',
          value: 'item1',
          logicalOperator: 'OR',
        },
        { column: 'name', operator: 'eq', value: 'item2' },
      ];

      const result = filterBuilder.buildWhere(filters);

      expect(result).toContain('AND');
      expect(result).toContain('OR');
    });
  });

  describe('Custom Handler Integration', () => {
    it('should use custom handlers when provided', () => {
      const mockHandler: FilterHandler = {
        canHandle: vi.fn().mockReturnValue(true),
        process: vi.fn().mockReturnValue('custom_condition = true'),
      };

      const customFilterBuilder = new FilterBuilder({
        serviceType: 'custom',
        columns: mockColumns,
        customHandlers: { test: mockHandler },
        escapeStrategy: 'drizzle',
      });

      const condition: FilterCondition = {
        column: 'name',
        operator: 'custom',
        value: 'test',
      };

      const result = customFilterBuilder.buildCondition(condition);

      expect(mockHandler.canHandle).toHaveBeenCalled();
      expect(mockHandler.process).toHaveBeenCalled();
      expect(result).toBe('custom_condition = true');
    });

    it('should fall back to standard processing when custom handlers cannot handle', () => {
      const mockHandler: FilterHandler = {
        canHandle: vi.fn().mockReturnValue(false),
        process: vi.fn(),
      };

      const customFilterBuilder = new FilterBuilder({
        serviceType: 'custom',
        columns: mockColumns,
        customHandlers: { test: mockHandler },
        escapeStrategy: 'drizzle',
      });

      const condition: FilterCondition = {
        column: 'name',
        operator: 'eq',
        value: 'test',
      };

      const result = customFilterBuilder.buildCondition(condition);

      expect(mockHandler.canHandle).toHaveBeenCalled();
      expect(mockHandler.process).not.toHaveBeenCalled();
      expect(result).toBe('"name" = \'test\'');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty filter arrays', () => {
      const result = filterBuilder.buildWhere([]);
      expect(result).toBe('');
    });

    it('should handle invalid column names', () => {
      const condition: FilterCondition = {
        column: 'nonexistent',
        operator: 'eq',
        value: 'test',
      };

      expect(() => filterBuilder.buildCondition(condition)).toThrow(
        "Column 'nonexistent' not found in metadata",
      );
    });

    it('should validate filter conditions', () => {
      const validCondition: FilterCondition = {
        column: 'name',
        operator: 'eq',
        value: 'test',
      };

      const invalidCondition: FilterCondition = {
        column: 'nonexistent',
        operator: 'eq',
        value: 'test',
      };

      expect(filterBuilder.validateFilter(validCondition).isValid).toBe(true);
      expect(filterBuilder.validateFilter(invalidCondition).isValid).toBe(
        false,
      );
    });

    it('should handle null and undefined values', () => {
      const conditions = [
        { column: 'name', operator: 'eq', value: null },
        { column: 'name', operator: 'eq', value: undefined },
      ];

      conditions.forEach((condition) => {
        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"name"');
      });
    });

    it('should handle special characters in values', () => {
      const specialChars = [
        "test'quote",
        'test"double',
        'test\\backslash',
        'test\nnewline',
      ];

      specialChars.forEach((value) => {
        const condition: FilterCondition = {
          column: 'name',
          operator: 'eq',
          value,
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"name"');
        expect(result).toContain('=');
      });
    });

    it('should handle very large values', () => {
      const largeValue = 'x'.repeat(10000);
      const condition: FilterCondition = {
        column: 'name',
        operator: 'eq',
        value: largeValue,
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toContain('"name"');
      expect(result).toContain('=');
    });

    it('should handle array values with mixed types', () => {
      const condition: FilterCondition = {
        column: 'metadata',
        operator: 'in',
        value: [1, 'string', true, null],
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toContain('"metadata"');
      expect(result).toContain('IN');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of filters efficiently', () => {
      const filters: FilterCondition[] = Array.from(
        { length: 1000 },
        (_, i) => ({
          column: 'name',
          operator: 'eq',
          value: `item_${i}`,
          logicalOperator: 'OR' as const,
        }),
      );

      const start = Date.now();
      const result = filterBuilder.buildWhere(filters);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result).toContain('WHERE');
      expect(result.split(' OR ')).toHaveLength(1000);
    });

    it('should reuse operator definitions efficiently', () => {
      const filters: FilterCondition[] = Array.from({ length: 100 }, () => ({
        column: 'name',
        operator: 'eq',
        value: 'test',
      }));

      const start = Date.now();
      filterBuilder.buildWhere(filters);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should be very fast with caching
    });
  });

  describe('Operator Registry', () => {
    it('should provide operators for all data types', () => {
      const dataTypes = [
        'text',
        'integer',
        'boolean',
        'timestamp',
        'json',
        'numeric',
      ];

      dataTypes.forEach((dataType) => {
        const operators = getOperatorsForDataType(dataType);
        expect(operators.length).toBeGreaterThan(0);
      });
    });

    it('should handle unknown operators gracefully', () => {
      const operator = getOperator('unknown_operator');
      expect(operator).toBeDefined(); // Should fall back to 'eq'
    });

    it('should provide comprehensive operator coverage', () => {
      const requiredOperators = [
        'eq',
        'neq',
        'gt',
        'gte',
        'lt',
        'lte',
        'contains',
        'startsWith',
        'endsWith',
        'in',
        'notIn',
        'isNull',
        'notNull',
        'between',
        'notBetween',
      ];

      requiredOperators.forEach((op) => {
        const operator = getOperator(op);
        expect(operator.key).toBe(op);
        expect(typeof operator.generateSql).toBe('function');
      });
    });
  });

  describe('Date Utilities Comprehensive Coverage', () => {
    it('should handle all relative date options correctly', () => {
      const options = [
        'today',
        'yesterday',
        'tomorrow',
        'thisWeek',
        'lastWeek',
        'nextWeek',
        'thisMonth',
        'lastMonth',
        'nextMonth',
        'last7Days',
        'next7Days',
        'last30Days',
        'next30Days',
        'thisYear',
        'lastYear',
      ];

      options.forEach((option) => {
        const relativeValue = createRelativeDateValue(option as 'today');
        expect(isRelativeDate(relativeValue)).toBe(true);

        const extracted = extractRelativeDateOption(relativeValue);
        expect(extracted).toBe(option);

        const range = getRelativeDateRange(option as 'today');
        expect(range.start).toBeInstanceOf(Date);
        expect(range.end).toBeInstanceOf(Date);

        const resolved = resolveRelativeDate(relativeValue);
        expect(resolved).toBeInstanceOf(Date);

        // formatRelativeDateForDisplay is in the filters UI package, not @pymekit/cms-filters-core
      });
    });

    it('should handle date ranges correctly', () => {
      const range = getRelativeDateRange('today');
      expect(range.start.getDate()).toBe(range.end.getDate());
      expect(range.start.getTime()).toBeLessThan(range.end.getTime());
    });

    it('should handle invalid relative dates gracefully', () => {
      expect(isRelativeDate('invalid')).toBe(false);
      expect(extractRelativeDateOption('invalid')).toBe(null);
      expect(resolveRelativeDate('invalid')).toBe('invalid');
    });
  });

  describe('Context Management', () => {
    it('should allow context updates', () => {
      const newColumns = [
        {
          name: 'new_field',
          ordering: null,
          display_name: null,
          description: null,
          is_searchable: true,
          is_visible_in_table: true,
          is_visible_in_detail: true,
          default_value: null,
          is_sortable: true,
          is_filterable: true,
          is_editable: true,
          is_primary_key: false,
          is_required: false,
          relations: [],
          ui_config: { data_type: 'text' },
        },
      ];

      filterBuilder.updateContext({ columns: newColumns });

      const condition: FilterCondition = {
        column: 'new_field',
        operator: 'eq',
        value: 'test',
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toBe('"new_field" = \'test\'');
    });

    it('should maintain service type context', () => {
      const condition: FilterCondition = {
        column: 'name',
        operator: 'eq',
        value: 'test',
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toContain('"name"'); // Should use quoted identifiers for SQL
    });
  });
});
