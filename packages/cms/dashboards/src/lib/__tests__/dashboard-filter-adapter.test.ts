import { describe, expect, it } from 'vitest';

import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

import type { AdvancedFilterCondition } from '../../types';
import {
  adaptFiltersForBackend,
  adaptFiltersForQuery,
  extractFiltersForQuery,
} from '../filters/dashboard-filter-adapter';
import type { FilterItem } from '../filters/filter-item.types';

describe('Dashboard Filter Adapter', () => {
  const mockColumns: ColumnMetadata[] = [
    {
      name: 'id',
      display_name: 'ID',
      ordering: 1,
      ui_config: {
        data_type: 'integer',
      },
    },
    {
      name: 'name',
      display_name: 'Name',
      ordering: 2,
      ui_config: {
        data_type: 'text',
      },
    },
    {
      name: 'created_at',
      display_name: 'Created At',
      ordering: 3,
      ui_config: {
        data_type: 'timestamp',
      },
    },
    {
      name: 'status',
      display_name: 'Status',
      ordering: 4,
      ui_config: {
        data_type: 'text',
        is_enum: true,
        enum_values: ['active', 'inactive', 'pending'],
      },
    },
  ];

  const mockRelations: RelationConfig[] = [
    {
      type: 'one_to_many',
      source_column: 'id',
      target_schema: 'public',
      target_table: 'profiles',
      target_column: 'user_id',
    },
  ];

  describe('adaptFiltersForQuery', () => {
    it('should convert simple AdvancedFilterCondition to FilterItem', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'eq',
          value: 'John Doe',
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'name',
        display_name: 'Name',
        values: [
          {
            operator: 'eq',
            value: 'John Doe',
            label: 'John Doe',
          },
        ],
      });
    });

    it('should handle multiple filters on the same column', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'id',
          operator: 'gt',
          value: 10,
        },
        {
          column: 'id',
          operator: 'lt',
          value: 100,
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('id');
      expect(result[0].values).toHaveLength(2);
      expect(result[0].values[0]).toMatchObject({
        operator: 'gt',
        value: 10,
        label: '10',
      });
      expect(result[0].values[1]).toMatchObject({
        operator: 'lt',
        value: 100,
        label: '100',
      });
    });

    it('should handle filters across multiple columns', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'contains',
          value: 'John',
        },
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);

      expect(result).toHaveLength(2);

      const nameFilter = result.find((f) => f.name === 'name');
      const statusFilter = result.find((f) => f.name === 'status');

      expect(nameFilter).toBeDefined();
      expect(statusFilter).toBeDefined();
      expect(nameFilter!.values[0]).toMatchObject({
        operator: 'contains',
        value: 'John',
        label: 'John',
      });
      expect(statusFilter!.values[0]).toMatchObject({
        operator: 'eq',
        value: 'active',
        label: 'active',
      });
    });

    it('should include relations for matching columns', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'id',
          operator: 'eq',
          value: 1,
        },
      ];

      const result = adaptFiltersForQuery(
        advancedFilters,
        mockColumns,
        mockRelations,
      );

      expect(result).toHaveLength(1);
      expect(result[0].relations).toHaveLength(1);
      expect(result[0].relations![0]).toMatchObject({
        source_column: 'id',
        target_table: 'profiles',
      });
    });

    it('should skip filters for non-existent columns', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'nonexistent_column',
          operator: 'eq',
          value: 'test',
        },
        {
          column: 'name',
          operator: 'eq',
          value: 'John',
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('name');
    });

    it('should handle various data types correctly', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'id',
          operator: 'eq',
          value: 123,
        },
        {
          column: 'name',
          operator: 'eq',
          value: 'test string',
        },
        {
          column: 'created_at',
          operator: 'after',
          value: new Date('2023-01-01'),
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);

      expect(result).toHaveLength(3);

      const idFilter = result.find((f) => f.name === 'id');
      const nameFilter = result.find((f) => f.name === 'name');
      const dateFilter = result.find((f) => f.name === 'created_at');

      expect(idFilter!.values[0].value).toBe(123);
      expect(nameFilter!.values[0].value).toBe('test string');
      expect(dateFilter!.values[0].value).toBeInstanceOf(Date);
    });
  });

  describe('extractFiltersForQuery', () => {
    it('should convert FilterItem array back to AdvancedFilterCondition array', () => {
      const filterItems: FilterItem[] = [
        {
          name: 'name',
          display_name: 'Name',
          ordering: 1,
          ui_config: {
            data_type: 'text',
          },
          values: [
            {
              operator: 'contains',
              value: 'John',
              label: 'John',
            },
          ],
        },
      ];

      const result = extractFiltersForQuery(filterItems);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        column: 'name',
        operator: 'contains',
        value: 'John',
      });
    });

    it('should handle multiple values per filter item', () => {
      const filterItems: FilterItem[] = [
        {
          name: 'status',
          display_name: 'Status',
          ordering: 1,
          ui_config: {
            data_type: 'text',
            is_enum: true,
            enum_values: ['active', 'pending'],
          },
          values: [
            {
              operator: 'eq',
              value: 'active',
              label: 'Active',
            },
            {
              operator: 'eq',
              value: 'pending',
              label: 'Pending',
            },
          ],
        },
      ];

      const result = extractFiltersForQuery(filterItems);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        column: 'status',
        operator: 'eq',
        value: 'active',
      });
      expect(result[1]).toMatchObject({
        column: 'status',
        operator: 'eq',
        value: 'pending',
      });
    });

    it('should skip empty filter values', () => {
      const filterItems: FilterItem[] = [
        {
          name: 'name',
          display_name: 'Name',
          ordering: 1,
          ui_config: {
            data_type: 'text',
          },
          values: [
            {
              operator: 'contains',
              value: '', // Empty value
              label: '',
            },
            {
              operator: 'contains',
              value: 'John',
              label: 'John',
            },
          ],
        },
      ];

      const result = extractFiltersForQuery(filterItems);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('John');
    });

    it('should include null operators (isNull, notNull)', () => {
      const filterItems: FilterItem[] = [
        {
          name: 'name',
          display_name: 'Name',
          ordering: 1,
          ui_config: {
            data_type: 'text',
          },
          values: [
            {
              operator: 'isNull',
              value: null,
              label: 'Is Null',
            },
          ],
        },
      ];

      const result = extractFiltersForQuery(filterItems);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        column: 'name',
        operator: 'isNull',
        value: null,
      });
    });
  });

  describe('Round-trip conversion', () => {
    it('should preserve data through both transformations', () => {
      const originalFilters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'contains',
          value: 'John',
        },
        {
          column: 'id',
          operator: 'gt',
          value: 10,
        },
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
        },
      ];

      // Convert to FilterItem format
      const filterItems = adaptFiltersForQuery(originalFilters, mockColumns);

      // Convert back to AdvancedFilterCondition format
      const convertedBack = extractFiltersForQuery(filterItems);

      // Should have same number of filters
      expect(convertedBack).toHaveLength(originalFilters.length);

      // Check each filter is preserved
      for (const originalFilter of originalFilters) {
        const matchingFilter = convertedBack.find(
          (f) =>
            f.column === originalFilter.column &&
            f.operator === originalFilter.operator,
        );
        expect(matchingFilter).toBeDefined();
        expect(matchingFilter!.value).toEqual(originalFilter.value);
      }
    });

    it('should handle complex multi-value scenarios', () => {
      const originalFilters: AdvancedFilterCondition[] = [
        {
          column: 'id',
          operator: 'gt',
          value: 10,
        },
        {
          column: 'id',
          operator: 'lt',
          value: 100,
        },
        {
          column: 'name',
          operator: 'contains',
          value: 'John',
        },
      ];

      const filterItems = adaptFiltersForQuery(originalFilters, mockColumns);
      const convertedBack = extractFiltersForQuery(filterItems);

      expect(convertedBack).toHaveLength(3);

      // Verify all original filters are preserved
      for (const original of originalFilters) {
        const found = convertedBack.find(
          (f) =>
            f.column === original.column &&
            f.operator === original.operator &&
            f.value === original.value,
        );
        expect(found).toBeDefined();
      }
    });
  });

  describe('Trend filter support', () => {
    it('should preserve config.isTrendFilter metadata when adapting to FilterItem', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-01-01,2023-12-31',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);

      expect(result).toHaveLength(1);
      expect(result[0].values[0]).toMatchObject({
        operator: 'between',
        value: '2023-01-01,2023-12-31',
      });
      expect(result[0].values[0].config).toEqual({
        isTrendFilter: true,
      });
    });

    it('should restore config.isTrendFilter when extracting from FilterItem', () => {
      const filterItems: FilterItem[] = [
        {
          name: 'created_at',
          display_name: 'Created At',
          ordering: 1,
          ui_config: {
            data_type: 'timestamp',
          },
          values: [
            {
              operator: 'between',
              value: '2023-01-01,2023-12-31',
              label: '2023 Date Range',
              config: {
                isTrendFilter: true,
              },
            },
          ],
        },
      ];

      const result = extractFiltersForQuery(filterItems);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        column: 'created_at',
        operator: 'between',
        value: '2023-01-01,2023-12-31',
        config: {
          isTrendFilter: true,
        },
      });
    });

    it('should handle round-trip conversion with trend filter config', () => {
      const originalFilters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'contains',
          value: 'John',
        },
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-01-01,2023-12-31',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      // Convert to FilterItem format
      const filterItems = adaptFiltersForQuery(originalFilters, mockColumns);

      // Convert back to AdvancedFilterCondition format
      const convertedBack = extractFiltersForQuery(filterItems);

      expect(convertedBack).toHaveLength(2);

      // Check regular filter is preserved
      const regularFilter = convertedBack.find((f) => f.column === 'name');
      expect(regularFilter).toMatchObject({
        column: 'name',
        operator: 'contains',
        value: 'John',
      });
      expect(regularFilter?.config).toBeUndefined();

      // Check trend filter is preserved with config
      const trendFilter = convertedBack.find((f) => f.column === 'created_at');
      expect(trendFilter).toMatchObject({
        column: 'created_at',
        operator: 'between',
        value: '2023-01-01,2023-12-31',
        config: {
          isTrendFilter: true,
        },
      });
    });
  });

  describe('Trend Period Calculation', () => {
    it('should preserve trend filter metadata for period calculation', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-01-01,2023-01-07', // 7-day period
          config: {
            isTrendFilter: true,
          },
        },
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);

      // Find the trend filter
      const trendFilterItem = result.find((item) =>
        item.values.some((v) => v.config?.isTrendFilter),
      );

      expect(trendFilterItem).toBeDefined();
      expect(trendFilterItem?.name).toBe('created_at');
      expect(trendFilterItem?.values[0].config?.isTrendFilter).toBe(true);
      expect(trendFilterItem?.values[0].value).toBe('2023-01-01,2023-01-07');
    });

    it('should handle multiple date columns for trend analysis', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'gte',
          value: '2023-01-01',
          config: {
            isTrendFilter: true,
          },
        },
        {
          column: 'created_at',
          operator: 'lte',
          value: '2023-01-31',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);

      const trendFilterItems = result.filter((item) =>
        item.values.some((v) => v.config?.isTrendFilter),
      );

      expect(trendFilterItems).toHaveLength(1); // Same column, so grouped together
      expect(trendFilterItems[0].name).toBe('created_at');
      expect(trendFilterItems[0].values).toHaveLength(2); // Two filters on same column
      expect(
        trendFilterItems[0].values.every((v) => v.config?.isTrendFilter),
      ).toBe(true);
    });

    it('should preserve relative date trend filters', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'during',
          value: '__rel_date:last30Days',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);

      expect(result).toHaveLength(1);
      expect(result[0].values[0]).toMatchObject({
        operator: 'during',
        value: '__rel_date:last30Days',
        config: {
          isTrendFilter: true,
        },
      });
    });

    it('should handle trend filters with complex date ranges', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-01-01T00:00:00Z,2023-01-31T23:59:59Z',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);
      const backendFilters = extractFiltersForQuery(result);

      expect(backendFilters).toHaveLength(1);
      expect(backendFilters[0]).toMatchObject({
        column: 'created_at',
        operator: 'between',
        value: '2023-01-01T00:00:00Z,2023-01-31T23:59:59Z',
        config: {
          isTrendFilter: true,
        },
      });
    });

    it('should separate trend and regular filters correctly', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'contains',
          value: 'test',
        },
        {
          column: 'created_at',
          operator: 'gte',
          value: '2023-01-01',
          config: {
            isTrendFilter: true,
          },
        },
        {
          column: 'status',
          operator: 'in',
          value: ['active', 'pending'],
        },
        {
          column: 'created_at',
          operator: 'lt',
          value: '2023-02-01',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const result = adaptFiltersForQuery(advancedFilters, mockColumns);
      const backendFilters = extractFiltersForQuery(result);

      const trendFilters = backendFilters.filter(
        (f) => f.config?.isTrendFilter,
      );
      const regularFilters = backendFilters.filter(
        (f) => !f.config?.isTrendFilter,
      );

      expect(trendFilters).toHaveLength(2);
      expect(regularFilters).toHaveLength(2);

      // Check trend filters
      expect(trendFilters.every((f) => f.column === 'created_at')).toBe(true);
      expect(trendFilters.map((f) => f.operator)).toEqual(['gte', 'lt']);

      // Check regular filters
      expect(regularFilters.map((f) => f.column)).toEqual(['name', 'status']);
    });
  });

  describe('adaptFiltersForBackend', () => {
    it('should convert AdvancedFilterCondition to FilterCondition format', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'eq',
          value: 'test',
          logicalOperator: 'AND',
          config: {
            isTrendFilter: true, // This should be stripped
          },
        },
      ];

      const result = adaptFiltersForBackend(advancedFilters);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        column: 'name',
        operator: 'eq',
        value: 'test',
        logicalOperator: 'AND',
      });

      // Config should be stripped for backend
      expect((result[0] as any).config).toBeUndefined();
    });

    it('should handle filters without logicalOperator', () => {
      const advancedFilters: AdvancedFilterCondition[] = [
        {
          column: 'status',
          operator: 'in',
          value: ['active', 'pending'],
        },
      ];

      const result = adaptFiltersForBackend(advancedFilters);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        column: 'status',
        operator: 'in',
        value: ['active', 'pending'],
        logicalOperator: undefined,
      });
    });

    it('should handle empty filter arrays', () => {
      const result = adaptFiltersForBackend([]);
      expect(result).toEqual([]);
    });
  });
});
