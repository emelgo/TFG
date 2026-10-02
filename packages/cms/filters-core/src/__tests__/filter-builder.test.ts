import { beforeEach, describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { FilterBuilder } from '../filter-builder';
import type { FilterCondition, FilterContext } from '../types';

describe('FilterBuilder', () => {
  let filterBuilder: FilterBuilder;
  let mockColumns: ColumnMetadata[];
  let context: FilterContext;

  beforeEach(() => {
    mockColumns = [
      {
        name: 'created_at',
        ui_config: { data_type: 'timestamp with time zone' },
        is_nullable: false,
        is_primary_key: false,
        is_unique: false,
        is_searchable: true,
        is_sortable: true,
        is_filterable: true,
      },
      {
        name: 'status',
        ui_config: { data_type: 'text' },
        is_nullable: false,
        is_primary_key: false,
        is_unique: false,
        is_searchable: true,
        is_sortable: true,
        is_filterable: true,
      },
      {
        name: 'amount',
        ui_config: { data_type: 'numeric' },
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
        is_nullable: false,
        is_primary_key: false,
        is_unique: false,
        is_searchable: false,
        is_sortable: true,
        is_filterable: true,
      },
    ];

    context = {
      serviceType: 'widgets',
      columns: mockColumns,
      escapeStrategy: 'drizzle',
    };

    filterBuilder = new FilterBuilder(context);
  });

  describe('buildWhere', () => {
    it('should return empty string for no filters', () => {
      const result = filterBuilder.buildWhere([]);
      expect(result).toBe('');
    });

    it('should build simple WHERE clause for single filter', () => {
      const filters: FilterCondition[] = [
        { column: 'status', operator: 'eq', value: 'active' },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toBe('WHERE "status" = \'active\'');
    });

    it('should handle multiple filters with AND logic', () => {
      const filters: FilterCondition[] = [
        { column: 'status', operator: 'eq', value: 'active' },
        { column: 'amount', operator: 'gt', value: 100 },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toBe('WHERE "status" = \'active\' AND "amount" > 100');
    });

    it('should handle custom logical operators', () => {
      const filters: FilterCondition[] = [
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
          logicalOperator: 'OR',
        },
        { column: 'status', operator: 'eq', value: 'pending' },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toBe(
        'WHERE "status" = \'active\' OR "status" = \'pending\'',
      );
    });
  });

  describe('relative date handling', () => {
    it('should convert "today" equality to date range', () => {
      const filters: FilterCondition[] = [
        { column: 'created_at', operator: 'eq', value: '__rel_date:today' },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toMatch(/WHERE "created_at" BETWEEN '.*' AND '.*'/);

      // Check that it spans the full day
      const match = result.match(/BETWEEN '([^']+)' AND '([^']+)'/);
      expect(match).toBeTruthy();
      if (match) {
        const [, start, end] = match;
        const startDate = new Date(start);
        const endDate = new Date(end);

        // Should be same day but different times
        expect(startDate.toDateString()).toBe(endDate.toDateString());
        expect(startDate.getHours()).toBe(0); // Start of day
        expect(endDate.getHours()).toBe(23); // End of day
      }
    });

    it('should handle relative date ranges like "thisWeek"', () => {
      const filters: FilterCondition[] = [
        { column: 'created_at', operator: 'eq', value: '__rel_date:thisWeek' },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toMatch(/WHERE "created_at" BETWEEN '.*' AND '.*'/);
    });

    it('should handle relative dates with other operators', () => {
      const filters: FilterCondition[] = [
        { column: 'created_at', operator: 'gt', value: '__rel_date:yesterday' },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toMatch(/WHERE "created_at" > '.*'/);
    });
  });

  describe('absolute date handling', () => {
    it('should convert absolute dates to ranges', () => {
      const filters: FilterCondition[] = [
        { column: 'created_at', operator: 'eq', value: '2024-01-15' },
      ];

      const result = filterBuilder.buildWhere(filters);

      // Should convert proper date formats to ranges (preserves dashboard functionality)
      expect(result).toMatch(/WHERE "created_at" BETWEEN '.*' AND '.*'/);
      expect(result).toContain('2024-01-15');
    });
  });

  describe('operator support', () => {
    it('should handle IN operator with arrays', () => {
      const filters: FilterCondition[] = [
        { column: 'status', operator: 'in', value: ['active', 'pending'] },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toBe("WHERE \"status\" IN ('active', 'pending')");
    });

    it('should handle comparison operators', () => {
      const filters: FilterCondition[] = [
        { column: 'amount', operator: 'gte', value: 100 },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toBe('WHERE "amount" >= 100');
    });

    it('should handle text search operators', () => {
      const filters: FilterCondition[] = [
        { column: 'status', operator: 'contains', value: 'act' },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toBe('WHERE "status" ILIKE \'%act%\'');
    });

    it('should handle null operators', () => {
      const filters: FilterCondition[] = [
        { column: 'status', operator: 'isNull', value: null },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toBe('WHERE "status" IS NULL');
    });
  });

  describe('validation', () => {
    it('should validate valid filters', () => {
      const filter: FilterCondition = {
        column: 'status',
        operator: 'eq',
        value: 'active',
      };

      const result = filterBuilder.validateFilter(filter);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch invalid column names', () => {
      const filter: FilterCondition = {
        column: 'nonexistent',
        operator: 'eq',
        value: 'test',
      };

      const result = filterBuilder.validateFilter(filter);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Column 'nonexistent' not found");
    });

    it('should validate numeric values', () => {
      const filter: FilterCondition = {
        column: 'amount',
        operator: 'gt',
        value: 'not-a-number',
      };

      const result = filterBuilder.validateFilter(filter);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid'))).toBe(true);
    });

    it('should support contains operator for character varying data type', () => {
      // Add a column with 'character varying' data type (PostgreSQL's actual string type)
      const varcharColumn: ColumnMetadata = {
        name: 'name',
        ui_config: { data_type: 'character varying' },
        is_nullable: false,
        is_primary_key: false,
        is_unique: false,
        is_searchable: true,
        is_sortable: true,
        is_filterable: true,
      };

      const builderWithVarchar = new FilterBuilder({
        ...context,
        columns: [...context.columns, varcharColumn],
      });

      const filter: FilterCondition = {
        column: 'name',
        operator: 'contains',
        value: 'test',
      };

      // Should validate successfully
      const validation = builderWithVarchar.validateFilter(filter);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Should generate correct SQL
      const result = builderWithVarchar.buildWhere([filter]);
      expect(result).toBe('WHERE "name" ILIKE \'%test%\'');
    });

    it('should support comparison operators for integer data type', () => {
      // Add a column with 'integer' data type
      const integerColumn: ColumnMetadata = {
        name: 'sort_order',
        ui_config: { data_type: 'integer' },
        is_nullable: false,
        is_primary_key: false,
        is_unique: false,
        is_searchable: false,
        is_sortable: true,
        is_filterable: true,
      };

      const builderWithInteger = new FilterBuilder({
        ...context,
        columns: [...context.columns, integerColumn],
      });

      const filter: FilterCondition = {
        column: 'sort_order',
        operator: 'gt',
        value: 10,
      };

      // Should validate successfully
      const validation = builderWithInteger.validateFilter(filter);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Should generate correct SQL
      const result = builderWithInteger.buildWhere([filter]);
      expect(result).toBe('WHERE "sort_order" > 10');
    });
  });

  describe('custom handlers', () => {
    it('should use custom handlers when available', () => {
      const customHandler = {
        canHandle: () => true,
        process: () => 'custom_condition = true',
      };

      const builderWithCustom = new FilterBuilder({
        ...context,
        customHandlers: { custom: customHandler },
      });

      const filters: FilterCondition[] = [
        { column: 'test', operator: 'custom', value: 'test' },
      ];

      const result = builderWithCustom.buildWhere(filters);
      expect(result).toBe('WHERE custom_condition = true');
    });

    it('should fall back to standard processing when custom handler cannot handle', () => {
      const customHandler = {
        canHandle: () => false,
        process: () => 'custom_condition = true',
      };

      const builderWithCustom = new FilterBuilder({
        ...context,
        customHandlers: { custom: customHandler },
      });

      const filters: FilterCondition[] = [
        { column: 'status', operator: 'eq', value: 'active' },
      ];

      const result = builderWithCustom.buildWhere(filters);
      expect(result).toBe('WHERE "status" = \'active\'');
    });
  });

  describe('context updates', () => {
    it('should allow updating context', () => {
      const newColumns: ColumnMetadata[] = [
        {
          name: 'new_column',
          ui_config: { data_type: 'text' },
          is_nullable: false,
          is_primary_key: false,
          is_unique: false,
          is_searchable: true,
          is_sortable: true,
          is_filterable: true,
        },
      ];

      filterBuilder.updateContext({ columns: newColumns });

      const filters: FilterCondition[] = [
        { column: 'new_column', operator: 'eq', value: 'test' },
      ];

      const result = filterBuilder.buildWhere(filters);
      expect(result).toBe('WHERE "new_column" = \'test\'');
    });
  });
});
