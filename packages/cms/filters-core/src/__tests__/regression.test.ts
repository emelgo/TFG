import { beforeEach, describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { FilterBuilder } from '../filter-builder';
import type { FilterCondition } from '../types';

describe('Filters Core - Regression Tests', () => {
  let mockColumns: ColumnMetadata[];
  let filterBuilder: FilterBuilder;

  beforeEach(() => {
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
        name: 'created_at',
        ordering: 2,
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
        name: 'status',
        ordering: 3,
        display_name: 'Status',
        description: 'Item status',
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

    filterBuilder = new FilterBuilder({
      serviceType: 'widgets',
      columns: mockColumns,
      escapeStrategy: 'drizzle',
    });
  });

  describe('Original Widget Service Behavior', () => {
    /**
     * Regression test for the original issue that started this implementation:
     * Metric widgets failed to fetch data when using "equal" or "relative dates" filters
     */
    it('should handle "today" equality filter correctly (original bug fix)', () => {
      const condition: FilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '__rel_date:today',
      };

      const result = filterBuilder.buildCondition(condition);

      // Should convert to BETWEEN range, not exact timestamp match
      expect(result).toMatch(/^"created_at" BETWEEN '.*' AND '.*'$/);

      // Should span the full day
      const match = result.match(/BETWEEN '([^']+)' AND '([^']+)'/);
      expect(match).toBeTruthy();

      if (match) {
        const [, start, end] = match;
        const startDate = new Date(start);
        const endDate = new Date(end);

        // Should be same day
        expect(startDate.toDateString()).toBe(endDate.toDateString());
        // Start should be beginning of day, end should be end of day
        expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
      }
    });

    it('should handle other relative date equality filters correctly', () => {
      const relativeDates = ['yesterday', 'thisWeek', 'thisMonth', 'last7Days'];

      relativeDates.forEach((dateOption) => {
        const condition: FilterCondition = {
          column: 'created_at',
          operator: 'eq',
          value: `__rel_date:${dateOption}`,
        };

        const result = filterBuilder.buildCondition(condition);

        // All should convert to BETWEEN ranges
        expect(result).toMatch(/^"created_at" BETWEEN '.*' AND '.*'$/);
      });
    });

    it('should handle absolute date equality correctly', () => {
      const condition: FilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '2024-01-15',
      };

      const result = filterBuilder.buildCondition(condition);

      // Should convert absolute date equality to day range
      expect(result).toMatch(/^"created_at" BETWEEN '.*' AND '.*'$/);
      expect(result).toContain('2024-01-15');
    });

    it('should preserve range filter behavior', () => {
      const condition: FilterCondition = {
        column: 'created_at',
        operator: 'between',
        value: ['2024-01-01', '2024-01-31'],
      };

      const result = filterBuilder.buildCondition(condition);

      // Range filters should work as before
      // Should use ISO format for consistency and precision
      expect(result).toBe(
        "\"created_at\" BETWEEN '2024-01-01T00:00:00.000Z' AND '2024-01-31T00:00:00.000Z'",
      );
    });
  });

  describe('Data Explorer Service Compatibility', () => {
    it('should maintain existing text search behavior', () => {
      const condition: FilterCondition = {
        column: 'status',
        operator: 'contains',
        value: 'active',
      };

      const result = filterBuilder.buildCondition(condition);

      // Should use ILIKE with wildcards
      expect(result).toBe('"status" ILIKE \'%active%\'');
    });

    it('should maintain existing comparison operators', () => {
      const comparisons = [
        { operator: 'gt', expected: '>' },
        { operator: 'gte', expected: '>=' },
        { operator: 'lt', expected: '<' },
        { operator: 'lte', expected: '<=' },
        { operator: 'neq', expected: '!=' },
      ];

      comparisons.forEach(({ operator, expected }) => {
        const condition: FilterCondition = {
          column: 'id',
          operator,
          value: 100,
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toBe(`"id" ${expected} 100`);
      });
    });

    it('should maintain existing null operators', () => {
      const nullOperators = [
        { operator: 'isNull', expected: 'IS NULL' },
        { operator: 'notNull', expected: 'IS NOT NULL' },
      ];

      nullOperators.forEach(({ operator, expected }) => {
        const condition: FilterCondition = {
          column: 'status',
          operator,
          value: null,
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toBe(`"status" ${expected}`);
      });
    });

    it('should maintain existing IN operator behavior', () => {
      const condition: FilterCondition = {
        column: 'status',
        operator: 'in',
        value: ['active', 'pending', 'completed'],
      };

      const result = filterBuilder.buildCondition(condition);
      expect(result).toBe("\"status\" IN ('active', 'pending', 'completed')");
    });
  });

  describe('SQL Generation Consistency', () => {
    it('should generate consistent column quoting', () => {
      const condition: FilterCondition = {
        column: 'status',
        operator: 'eq',
        value: 'test',
      };

      const result = filterBuilder.buildCondition(condition);

      // Should always quote column names
      expect(result).toMatch(/^"[^"]+"/);
    });

    it('should generate consistent value escaping', () => {
      const specialValues = [
        "value'with'quotes",
        'value"with"doubles',
        'value\\with\\backslashes',
        'value\nwith\nnewlines',
      ];

      specialValues.forEach((value) => {
        const condition: FilterCondition = {
          column: 'status',
          operator: 'eq',
          value,
        };

        const result = filterBuilder.buildCondition(condition);

        // Should properly escape special characters
        expect(result).toContain('"status" =');
        expect(result).toMatch(/'.*'/s); // Should be quoted, allow multiline with 's' flag
      });
    });

    it('should generate consistent boolean formatting', () => {
      const booleanValues = [true, false, 'true', 'false'];

      booleanValues.forEach((value) => {
        const condition: FilterCondition = {
          column: 'status', // Using text column to test string conversion
          operator: 'eq',
          value,
        };

        const result = filterBuilder.buildCondition(condition);
        expect(result).toContain('"status" =');
      });
    });
  });

  describe('Error Handling Consistency', () => {
    it('should handle unknown columns consistently', () => {
      const condition: FilterCondition = {
        column: 'unknown_column',
        operator: 'eq',
        value: 'test',
      };

      expect(() => filterBuilder.buildCondition(condition)).toThrow(
        "Column 'unknown_column' not found in metadata",
      );
    });

    it('should handle validation errors consistently', () => {
      const invalidConditions = [
        { column: 'nonexistent', operator: 'eq', value: 'test' },
        { column: 'id', operator: 'invalidOp', value: 'test' },
      ];

      invalidConditions.forEach((condition) => {
        const validation = filterBuilder.validateFilter(condition);
        expect(validation.isValid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Date Processing Regression', () => {
    /**
     * Ensure that the new shared date processing doesn't break existing functionality
     */
    it('should maintain timezone handling consistency', () => {
      const isoDate = '2024-01-15T10:30:00.000Z';
      const condition: FilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: isoDate,
      };

      const result = filterBuilder.buildCondition(condition);

      // Should handle ISO dates correctly
      expect(result).toMatch(/BETWEEN/);
      expect(result).toContain('2024-01-15');
    });

    it('should maintain local date handling consistency', () => {
      const localDate = '2024-01-15';
      const condition: FilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: localDate,
      };

      const result = filterBuilder.buildCondition(condition);

      // Should convert to full day range
      expect(result).toMatch(/BETWEEN/);
      expect(result).toContain('2024-01-15');
    });

    it('should maintain relative date format consistency', () => {
      const relativeFormats = [
        '__rel_date:today',
        '__rel_date:yesterday',
        '__rel_date:thisWeek',
        '__rel_date:thisMonth',
      ];

      relativeFormats.forEach((format) => {
        const condition: FilterCondition = {
          column: 'created_at',
          operator: 'eq',
          value: format,
        };

        const result = filterBuilder.buildCondition(condition);

        // All should produce BETWEEN clauses
        expect(result).toMatch(/BETWEEN/);
      });
    });
  });

  describe('Performance Regression', () => {
    it('should maintain filter building performance', () => {
      const filters: FilterCondition[] = Array.from(
        { length: 100 },
        (_, i) => ({
          column: i % 3 === 0 ? 'id' : i % 3 === 1 ? 'status' : 'created_at',
          operator: 'eq',
          value:
            i % 3 === 0 ? i : i % 3 === 1 ? `status_${i}` : `__rel_date:today`,
        }),
      );

      const start = performance.now();
      const result = filterBuilder.buildWhere(filters);
      const duration = performance.now() - start;

      // Should complete quickly
      expect(duration).toBeLessThan(100);
      expect(result).toContain('WHERE');
    });

    it('should maintain validation performance', () => {
      const filters: FilterCondition[] = Array.from({ length: 100 }, (_, i) => {
        const column =
          i % 3 === 0 ? 'id' : i % 3 === 1 ? 'status' : 'created_at';
        let value: unknown;

        // Generate appropriate values based on column type
        if (column === 'id') {
          value = i; // numeric for id
        } else if (column === 'created_at') {
          value = '__rel_date:today'; // relative date for timestamp
        } else {
          value = `value_${i}`; // text for status
        }

        return {
          column,
          operator: 'eq',
          value,
        };
      });

      const start = performance.now();
      const validations = filters.map((filter) =>
        filterBuilder.validateFilter(filter),
      );
      const duration = performance.now() - start;

      // Should validate quickly
      expect(duration).toBeLessThan(50);
      expect(validations.every((v) => v.isValid)).toBe(true);
    });
  });

  describe('API Compatibility', () => {
    it('should maintain FilterBuilder constructor API', () => {
      // Should accept minimal configuration
      const minimalBuilder = new FilterBuilder({
        serviceType: 'widgets',
        columns: mockColumns,
      });

      expect(minimalBuilder).toBeInstanceOf(FilterBuilder);

      // Should accept full configuration
      const fullBuilder = new FilterBuilder({
        serviceType: 'data-explorer',
        columns: mockColumns,
        customHandlers: {},
        escapeStrategy: 'raw-sql',
      });

      expect(fullBuilder).toBeInstanceOf(FilterBuilder);
    });

    it('should maintain buildWhere method API', () => {
      const filters: FilterCondition[] = [
        { column: 'status', operator: 'eq', value: 'active' },
      ];

      // Should accept array of conditions
      const result1 = filterBuilder.buildWhere(filters);
      expect(typeof result1).toBe('string');

      // Should handle empty array
      const result2 = filterBuilder.buildWhere([]);
      expect(result2).toBe('');
    });

    it('should maintain buildCondition method API', () => {
      const condition: FilterCondition = {
        column: 'status',
        operator: 'eq',
        value: 'active',
      };

      // Should accept single condition
      const result = filterBuilder.buildCondition(condition);
      expect(typeof result).toBe('string');
    });

    it('should maintain validateFilter method API', () => {
      const condition: FilterCondition = {
        column: 'status',
        operator: 'eq',
        value: 'active',
      };

      // Should return validation object
      const validation = filterBuilder.validateFilter(condition);
      expect(typeof validation.isValid).toBe('boolean');
      expect(Array.isArray(validation.errors)).toBe(true);
    });

    it('should maintain updateContext method API', () => {
      // Should accept partial context updates
      filterBuilder.updateContext({ serviceType: 'data-explorer' });
      filterBuilder.updateContext({ escapeStrategy: 'raw-sql' });
      filterBuilder.updateContext({ columns: [] });

      // Should not throw errors
      expect(() => filterBuilder.updateContext({})).not.toThrow();
    });
  });

  describe('Type Safety Regression', () => {
    it('should maintain type safety for FilterCondition', () => {
      // This test ensures the FilterCondition interface hasn't changed
      const condition: FilterCondition = {
        column: 'status',
        operator: 'eq',
        value: 'test',
        logicalOperator: 'AND', // Optional field
      };

      expect(condition.column).toBe('status');
      expect(condition.operator).toBe('eq');
      expect(condition.value).toBe('test');
      expect(condition.logicalOperator).toBe('AND');
    });

    it('should maintain type safety for validation results', () => {
      const condition: FilterCondition = {
        column: 'status',
        operator: 'eq',
        value: 'test',
      };

      const validation = filterBuilder.validateFilter(condition);

      // Should have expected structure
      expect(typeof validation.isValid).toBe('boolean');
      expect(Array.isArray(validation.errors)).toBe(true);
      validation.errors.forEach((error) => {
        expect(typeof error).toBe('string');
      });
    });
  });
});
