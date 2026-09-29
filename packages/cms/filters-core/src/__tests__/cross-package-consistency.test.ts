/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { FilterBuilder } from '../filter-builder';
import type { FilterCondition, FilterContext, FilterHandler } from '../types';

/**
 * Cross-package consistency tests to ensure filters work identically
 * across data-explorer and dashboard widgets
 */
describe('Cross-Package Filter Consistency', () => {
  let mockColumns: ColumnMetadata[];

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
        display_name: 'Created',
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
        ordering: 4,
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
        name: 'price',
        ordering: 5,
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
    ];
  });

  describe('Data Explorer vs Dashboard Widget Consistency', () => {
    it('should produce identical SQL for both service types without custom handlers', () => {
      const dataExplorerBuilder = new FilterBuilder({
        serviceType: 'data-explorer',
        columns: mockColumns,
        escapeStrategy: 'raw-sql',
      });

      const widgetBuilder = new FilterBuilder({
        serviceType: 'widgets',
        columns: mockColumns,
        escapeStrategy: 'drizzle',
      });

      const testFilters: FilterCondition[] = [
        { column: 'name', operator: 'contains', value: 'test' },
        { column: 'id', operator: 'gt', value: 100 },
        { column: 'created_at', operator: 'eq', value: '__rel_date:today' },
      ];

      testFilters.forEach((filter) => {
        const explorerSQL = dataExplorerBuilder.buildCondition(filter);
        const widgetSQL = widgetBuilder.buildCondition(filter);

        // Both should produce valid SQL
        expect(explorerSQL).toContain(`"${filter.column}"`);
        expect(widgetSQL).toContain(`"${filter.column}"`);

        // For relative dates, both should use BETWEEN
        if (filter.value === '__rel_date:today') {
          expect(explorerSQL).toContain('BETWEEN');
          expect(widgetSQL).toContain('BETWEEN');
        }
      });
    });

    it('should handle complex filter combinations consistently', () => {
      const dataExplorerBuilder = new FilterBuilder({
        serviceType: 'data-explorer',
        columns: mockColumns,
      });

      const widgetBuilder = new FilterBuilder({
        serviceType: 'widgets',
        columns: mockColumns,
      });

      const complexFilters: FilterCondition[] = [
        { column: 'name', operator: 'startsWith', value: 'John' },
        { column: 'price', operator: 'between', value: [10, 100] },
        { column: 'metadata', operator: 'isNull', value: null },
      ];

      const explorerWhere = dataExplorerBuilder.buildWhere(complexFilters);
      const widgetWhere = widgetBuilder.buildWhere(complexFilters);

      // Both should start with WHERE
      expect(explorerWhere).toMatch(/^WHERE /);
      expect(widgetWhere).toMatch(/^WHERE /);

      // Both should have all three conditions
      expect(explorerWhere).toContain('"name"');
      expect(explorerWhere).toContain('"price"');
      expect(explorerWhere).toContain('"metadata"');
      expect(widgetWhere).toContain('"name"');
      expect(widgetWhere).toContain('"price"');
      expect(widgetWhere).toContain('"metadata"');

      // Both should use the same operators
      expect(explorerWhere).toContain('ILIKE');
      expect(explorerWhere).toContain('BETWEEN');
      expect(explorerWhere).toContain('IS NULL');
      expect(widgetWhere).toContain('ILIKE');
      expect(widgetWhere).toContain('BETWEEN');
      expect(widgetWhere).toContain('IS NULL');
    });

    it('should validate filters consistently across service types', () => {
      const dataExplorerBuilder = new FilterBuilder({
        serviceType: 'data-explorer',
        columns: mockColumns,
      });

      const widgetBuilder = new FilterBuilder({
        serviceType: 'widgets',
        columns: mockColumns,
      });

      const invalidFilters = [
        // Invalid column
        { column: 'non_existent', operator: 'eq', value: 'test' },
        // Invalid operator for data type
        { column: 'name', operator: 'gt', value: 'test' },
        // Invalid value for numeric
        { column: 'price', operator: 'eq', value: 'not_a_number' },
      ];

      invalidFilters.forEach((filter) => {
        const explorerValidation = dataExplorerBuilder.validateFilter(filter);
        const widgetValidation = widgetBuilder.validateFilter(filter);

        // Both should report the same validation status
        expect(explorerValidation.isValid).toBe(widgetValidation.isValid);

        // Both should have errors for invalid filters
        if (!explorerValidation.isValid) {
          expect(explorerValidation.errors.length).toBeGreaterThan(0);
          expect(widgetValidation.errors.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Custom Handler Integration Points', () => {
    it('should allow service-specific custom handlers without breaking core functionality', () => {
      // Mock custom handler that only handles specific JSON operations
      const customJsonHandler: FilterHandler = {
        canHandle(condition: FilterCondition, context: FilterContext): boolean {
          const column = context.columns.find(
            (col) => col.name === condition.column,
          );
          return (
            column?.ui_config.data_type === 'jsonb' &&
            condition.operator === 'customJsonOp'
          );
        },
        process(condition: FilterCondition, _context: FilterContext): string {
          return `"${condition.column}" @@ '${condition.value}'::jsonpath`;
        },
      };

      const builderWithHandler = new FilterBuilder({
        serviceType: 'custom',
        columns: mockColumns,
        customHandlers: { jsonCustom: customJsonHandler },
      });

      // Custom handler should work for its specific case
      const customFilter: FilterCondition = {
        column: 'metadata',
        operator: 'customJsonOp',
        value: '$.key',
      };

      const customResult = builderWithHandler.buildCondition(customFilter);
      expect(customResult).toContain('@@');
      expect(customResult).toContain('jsonpath');

      // Standard operators should still work normally
      const standardFilter: FilterCondition = {
        column: 'metadata',
        operator: 'eq',
        value: { key: 'value' },
      };

      const standardResult = builderWithHandler.buildCondition(standardFilter);
      expect(standardResult).toContain('"metadata"');
      expect(standardResult).toContain('=');
    });

    it('should prioritize custom handlers over built-in processing when applicable', () => {
      let handlerCalled = false;

      const overrideHandler: FilterHandler = {
        canHandle(
          condition: FilterCondition,
          _context: FilterContext,
        ): boolean {
          return condition.column === 'name' && condition.operator === 'eq';
        },
        process(condition: FilterCondition, _context: FilterContext): string {
          handlerCalled = true;
          return `CUSTOM("${condition.column}" = '${condition.value}')`;
        },
      };

      const builderWithOverride = new FilterBuilder({
        serviceType: 'custom',
        columns: mockColumns,
        customHandlers: { override: overrideHandler },
      });

      const filter: FilterCondition = {
        column: 'name',
        operator: 'eq',
        value: 'test',
      };

      const result = builderWithOverride.buildCondition(filter);
      expect(handlerCalled).toBe(true);
      expect(result).toContain('CUSTOM');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty and null values consistently', () => {
      const builder = new FilterBuilder({
        serviceType: 'widgets',
        columns: mockColumns,
      });

      const edgeCaseFilters: FilterCondition[] = [
        { column: 'name', operator: 'eq', value: '' },
        { column: 'name', operator: 'eq', value: null },
        { column: 'price', operator: 'eq', value: 0 },
        { column: 'metadata', operator: 'isNull', value: null },
      ];

      edgeCaseFilters.forEach((filter) => {
        const result = builder.buildCondition(filter);
        expect(result).toContain(`"${filter.column}"`);

        // Check for appropriate handling
        if (filter.value === null && filter.operator !== 'isNull') {
          expect(result).toContain('NULL');
        } else if (filter.value === '') {
          expect(result).toContain("''");
        } else if (filter.value === 0) {
          expect(result).toContain('0');
        }
      });
    });

    it('should escape SQL injection attempts consistently', () => {
      const builder = new FilterBuilder({
        serviceType: 'widgets',
        columns: mockColumns,
      });

      const maliciousFilters: FilterCondition[] = [
        { column: 'name', operator: 'eq', value: "'; DROP TABLE users; --" },
        { column: 'name', operator: 'contains', value: "' OR '1'='1" },
        {
          column: 'metadata',
          operator: 'eq',
          value: { key: "'; DELETE FROM data; --" },
        },
      ];

      maliciousFilters.forEach((filter) => {
        const result = builder.buildCondition(filter);

        // Should properly escape single quotes to prevent injection
        // The escaped version should have '' instead of '
        if (typeof filter.value === 'string' && filter.value.includes("'")) {
          expect(result).toContain("''");
          // The dangerous SQL should be within escaped quotes
          expect(result).toMatch(/['"].*''/);
        } else if (typeof filter.value === 'object') {
          // For JSON, the entire object should be escaped as a string
          expect(result).toContain('{"key":"');
        }

        // The result should be a valid SQL condition
        expect(result).toContain(`"${filter.column}"`);
      });
    });

    it('should handle array values for IN/NOT IN operators consistently', () => {
      const builder = new FilterBuilder({
        serviceType: 'widgets',
        columns: mockColumns,
      });

      const arrayFilters: FilterCondition[] = [
        { column: 'id', operator: 'in', value: [1, 2, 3] },
        {
          column: 'name',
          operator: 'notIn',
          value: ['Alice', 'Bob', "O'Brien"],
        },
        { column: 'id', operator: 'in', value: [] }, // Empty array edge case
      ];

      arrayFilters.forEach((filter) => {
        const result = builder.buildCondition(filter);

        expect(result).toContain(`"${filter.column}"`);
        expect(result).toContain(
          filter.operator === 'in' ? ' IN ' : ' NOT IN ',
        );

        // Check for proper escaping of quotes in strings
        if (filter.value && Array.isArray(filter.value)) {
          filter.value.forEach((val) => {
            if (typeof val === 'string' && val.includes("'")) {
              expect(result).toContain("''"); // Escaped quote
            }
          });
        }
      });
    });
  });
});
