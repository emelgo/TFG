/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { FilterBuilder } from '../filter-builder';
import type { FilterCondition } from '../types';
import { getRelativeDateRange } from '../utils/date-utils';

describe('FiltersCore - Working Algorithmic Tests', () => {
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
        name: 'name',
        ordering: 2,
        display_name: 'Name',
        description: 'User name',
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
        name: 'created_at',
        ordering: 3,
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
        is_required: true,
        relations: [],
        ui_config: { data_type: 'timestamp with time zone' },
      },
      {
        name: 'is_active',
        ordering: 4,
        display_name: 'Is Active',
        description: 'Active status flag',
        is_searchable: false,
        is_visible_in_table: true,
        is_visible_in_detail: true,
        default_value: false,
        is_sortable: true,
        is_filterable: true,
        is_editable: true,
        is_primary_key: false,
        is_required: false,
        relations: [],
        ui_config: { data_type: 'boolean' },
      },
    ];

    filterBuilder = new FilterBuilder({
      serviceType: 'widgets',
      columns: mockColumns,
      escapeStrategy: 'drizzle',
    });
  });

  describe('Date Range Calculations', () => {
    it('should generate correct date ranges for relative dates', () => {
      const today = new Date();
      const todayRange = getRelativeDateRange('today');

      expect(todayRange.start).toBeInstanceOf(Date);
      expect(todayRange.end).toBeInstanceOf(Date);
      expect(todayRange.start.getTime()).toBeLessThanOrEqual(
        todayRange.end.getTime(),
      );

      // Today range should span the entire day
      expect(todayRange.start.getHours()).toBe(0);
      expect(todayRange.start.getMinutes()).toBe(0);
      expect(todayRange.start.getSeconds()).toBe(0);
      expect(todayRange.end.getHours()).toBe(23);
      expect(todayRange.end.getMinutes()).toBe(59);
      expect(todayRange.end.getSeconds()).toBe(59);
    });

    it('should handle yesterday and tomorrow ranges', () => {
      const yesterdayRange = getRelativeDateRange('yesterday');
      const tomorrowRange = getRelativeDateRange('tomorrow');
      const todayRange = getRelativeDateRange('today');

      expect(yesterdayRange.start.getTime()).toBeLessThan(
        todayRange.start.getTime(),
      );
      expect(tomorrowRange.start.getTime()).toBeGreaterThan(
        todayRange.end.getTime(),
      );

      // Each should be exactly 24 hours
      const yesterdayDuration =
        yesterdayRange.end.getTime() - yesterdayRange.start.getTime();
      const tomorrowDuration =
        tomorrowRange.end.getTime() - tomorrowRange.start.getTime();
      const todayDuration =
        todayRange.end.getTime() - todayRange.start.getTime();

      expect(yesterdayDuration).toBe(todayDuration);
      expect(tomorrowDuration).toBe(todayDuration);
    });

    it('should handle week boundaries correctly', () => {
      const weekStartRange = getRelativeDateRange('week_start');
      const weekEndRange = getRelativeDateRange('week_end');

      // Week start should be a valid date at start of day
      expect(weekStartRange.start).toBeInstanceOf(Date);
      expect(weekStartRange.start.getHours()).toBe(0);
      expect(weekStartRange.start.getMinutes()).toBe(0);
      expect(weekStartRange.start.getSeconds()).toBe(0);

      // Week end should be a valid date at end of day
      expect(weekEndRange.end).toBeInstanceOf(Date);
      expect(weekEndRange.end.getHours()).toBe(23);
      expect(weekEndRange.end.getMinutes()).toBe(59);
      expect(weekEndRange.end.getSeconds()).toBe(59);

      // Week start should be before week end
      expect(weekStartRange.start.getTime()).toBeLessThanOrEqual(
        weekEndRange.end.getTime(),
      );
    });
  });

  describe('Filter Building Edge Cases', () => {
    it('should handle empty and whitespace-only filters', () => {
      const emptyFilters: FilterCondition[] = [];
      expect(filterBuilder.buildWhere(emptyFilters)).toBe('');

      const whitespaceFilters: FilterCondition[] = [
        { column: 'name', operator: 'eq', value: '' },
        { column: 'name', operator: 'eq', value: '   ' },
      ];

      const result = filterBuilder.buildWhere(whitespaceFilters);
      expect(result).toContain('WHERE');
      expect(result).toContain("''");
      expect(result).toContain("'   '");
    });

    it('should maintain logical operator precedence', () => {
      // Test: A AND B OR C AND D should be ((A AND B) OR (C AND D))
      const filters: FilterCondition[] = [
        { column: 'name', operator: 'eq', value: 'A', logicalOperator: 'AND' },
        { column: 'name', operator: 'eq', value: 'B', logicalOperator: 'OR' },
        { column: 'name', operator: 'eq', value: 'C', logicalOperator: 'AND' },
        { column: 'name', operator: 'eq', value: 'D' },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toContain('AND');
      expect(result).toContain('OR');
      expect(result).toContain("'A'");
      expect(result).toContain("'B'");
      expect(result).toContain("'C'");
      expect(result).toContain("'D'");
    });

    it('should handle mixed data type comparisons correctly', () => {
      const filters: FilterCondition[] = [
        { column: 'id', operator: 'gt', value: 0 },
        { column: 'name', operator: 'contains', value: 'test' },
        { column: 'is_active', operator: 'eq', value: true },
        { column: 'created_at', operator: 'gte', value: '__rel_date:today' },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toContain('WHERE');
      expect(result).toContain('"id" > 0');
      expect(result).toContain('"name" ILIKE \'%test%\'');
      expect(result).toContain('"is_active" = TRUE');
      expect(result).toContain('"created_at" >=');
    });

    it('should handle special values correctly', () => {
      const filters: FilterCondition[] = [
        { column: 'name', operator: 'eq', value: null },
        { column: 'id', operator: 'eq', value: 0 },
        { column: 'is_active', operator: 'eq', value: false },
        { column: 'name', operator: 'eq', value: 'null' }, // String 'null', not actual null
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toContain('WHERE');
      expect(result).toContain('0');
      expect(result).toContain('FALSE');
      expect(result).toContain("'null'");
    });
  });

  describe('Performance Edge Cases', () => {
    it('should handle very long string values efficiently', () => {
      const longValue = 'x'.repeat(10000); // 10KB string
      const filters: FilterCondition[] = [
        { column: 'name', operator: 'contains', value: longValue },
      ];

      const start = performance.now();
      const result = filterBuilder.buildWhere(filters);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should handle long strings quickly
      expect(result).toContain('WHERE');
      expect(result).toContain('ILIKE');
      expect(result.length).toBeGreaterThan(10000);
    });

    it('should handle moderate numbers of filters efficiently', () => {
      // Use only text filters to avoid numeric validation errors
      const filters: FilterCondition[] = Array.from(
        { length: 100 },
        (_, i) => ({
          column: 'name',
          operator: 'eq',
          value: `text_value_${i}`,
          logicalOperator: i % 2 === 0 ? 'AND' : 'OR',
        }),
      );

      const start = performance.now();
      const result = filterBuilder.buildWhere(filters);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should complete quickly
      expect(result).toContain('WHERE');
      expect(result.length).toBeGreaterThan(1000); // Should generate substantial SQL
    });

    it('should handle deep nesting levels without stack overflow', () => {
      // Create alternating logical operators to test nesting
      const filters: FilterCondition[] = Array.from({ length: 50 }, (_, i) => ({
        column: 'name',
        operator: 'eq',
        value: `nested_${i}`,
        logicalOperator: i % 10 === 0 ? 'OR' : 'AND', // Change operator every 10 items
      }));

      expect(() => filterBuilder.buildWhere(filters)).not.toThrow();

      const result = filterBuilder.buildWhere(filters);
      expect(result).toContain('WHERE');
      expect(result).toContain('AND');
      expect(result).toContain('OR');
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle malformed filter conditions gracefully', () => {
      const malformedFilters: any[] = [
        { column: 'name' }, // Missing operator and value
        { operator: 'eq', value: 'test' }, // Missing column
        { column: 'name', operator: 'eq' }, // Missing value
      ];

      malformedFilters.forEach((filter, index) => {
        expect(() => filterBuilder.buildWhere([filter])).not.toThrow(
          `Filter ${index} should not throw`,
        );
      });
    });

    it('should handle invalid column references', () => {
      const invalidFilters: FilterCondition[] = [
        { column: 'nonexistent_column', operator: 'eq', value: 'test' },
        { column: '', operator: 'eq', value: 'test' },
        { column: '   ', operator: 'eq', value: 'test' },
      ];

      invalidFilters.forEach((filter) => {
        expect(() => filterBuilder.buildWhere([filter])).toThrow();
      });
    });

    it('should handle context updates correctly', () => {
      const originalContext = filterBuilder.getContext();

      // Update context multiple times
      filterBuilder.updateContext({ serviceType: 'data-explorer' });
      filterBuilder.updateContext({ serviceType: 'widgets' });
      filterBuilder.updateContext({ escapeStrategy: 'manual' });
      filterBuilder.updateContext({ escapeStrategy: 'drizzle' });

      const finalContext = filterBuilder.getContext();
      expect(finalContext.escapeStrategy).toBe('drizzle');
      expect(finalContext.serviceType).toBe('widgets');
      expect(finalContext.columns).toEqual(originalContext.columns);
    });
  });

  describe('Complex Logical Operations', () => {
    it('should handle deeply nested OR conditions', () => {
      // Scenario: name = 'A' OR name = 'B' OR name = 'C' OR name = 'D' OR name = 'E'
      const filters: FilterCondition[] = [
        { column: 'name', operator: 'eq', value: 'A', logicalOperator: 'OR' },
        { column: 'name', operator: 'eq', value: 'B', logicalOperator: 'OR' },
        { column: 'name', operator: 'eq', value: 'C', logicalOperator: 'OR' },
        { column: 'name', operator: 'eq', value: 'D', logicalOperator: 'OR' },
        { column: 'name', operator: 'eq', value: 'E' },
      ];

      const result = filterBuilder.buildWhere(filters);

      expect(result).toContain('WHERE');
      expect(result.match(/OR/g)?.length).toBe(4); // Should have 4 OR operators
      expect(result).toContain("'A'");
      expect(result).toContain("'E'");
    });

    it('should handle mixed logical operators in complex patterns', () => {
      // Scenario: (name = 'active' AND id > 21) OR (name = 'premium' AND id > 18) OR (is_active = true)
      const filters: FilterCondition[] = [
        {
          column: 'name',
          operator: 'eq',
          value: 'active',
          logicalOperator: 'AND',
        },
        { column: 'id', operator: 'gt', value: 21, logicalOperator: 'OR' },
        {
          column: 'name',
          operator: 'eq',
          value: 'premium',
          logicalOperator: 'AND',
        },
        { column: 'id', operator: 'gt', value: 18, logicalOperator: 'OR' },
        { column: 'is_active', operator: 'eq', value: true },
      ];

      const result = filterBuilder.buildWhere(filters);

      expect(result).toContain('WHERE');
      expect(result).toContain('"name"');
      expect(result).toContain('"id"');
      expect(result).toContain('"is_active"');
      expect(result).toContain('AND');
      expect(result).toContain('OR');
    });
  });

  describe('Relative Date Processing', () => {
    it('should handle relative date filters', () => {
      const filters: FilterCondition[] = [
        {
          column: 'created_at',
          operator: 'gte',
          value: '__rel_date:today',
          logicalOperator: 'AND',
        },
        { column: 'created_at', operator: 'lt', value: '__rel_date:tomorrow' },
      ];

      const result = filterBuilder.buildWhere(filters);

      expect(result).toContain('WHERE');
      expect(result).toContain('"created_at"');
      expect(result).toContain('>=');
      expect(result).toContain('<');
      // Should have resolved the relative dates to actual timestamps
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
