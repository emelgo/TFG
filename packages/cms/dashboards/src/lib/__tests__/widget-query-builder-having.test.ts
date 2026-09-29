import { describe, expect, it, vi } from 'vitest';

import type { FilterCondition } from '@pymekit/cms-filters-core';

import { WidgetQueryBuilder } from '../widget-query-builder';

// Mock the data-explorer-core query-builder imports to avoid database dependency
vi.mock('@pymekit/cms-data-explorer-core/query-builder', () => ({
  TableQueryBuilder: {
    categorizeFilters: vi.fn((filters, context) => {
      // Simple mock implementation for testing
      const whereFilters: unknown[] = [];
      const havingFilters: unknown[] = [];

      if (!context.isAggregated) {
        return { whereFilters: filters, havingFilters: [] };
      }

      filters.forEach((filter: Record<string, unknown>) => {
        if (
          filter.column === 'value' ||
          filter.column.includes('COUNT') ||
          filter.column.includes('SUM')
        ) {
          havingFilters.push(filter);
        } else {
          whereFilters.push(filter);
        }
      });

      return { whereFilters, havingFilters };
    }),
  },
}));

describe('WidgetQueryBuilder HAVING Support', () => {
  const mockWidget = {
    schemaName: 'public',
    tableName: 'orders',
    widgetType: 'chart',
  };

  describe('Filter categorization for chart widgets', () => {
    it('should categorize filters correctly for aggregated chart', () => {
      const config = {
        xAxis: 'category',
        yAxis: '*',
        aggregation: 'count',
        filters: [
          {
            column: 'status',
            operator: 'eq',
            value: 'active',
            type: 'text',
          },
          {
            column: 'value',
            operator: 'gt',
            value: '100',
            type: 'number',
          },
          {
            column: 'COUNT(*)',
            operator: 'gte',
            value: '5',
            type: 'number',
          },
        ] as FilterCondition[],
      };

      const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);

      // Should have WHERE filters (pre-aggregation)
      expect(result.filters).toHaveLength(1);
      expect(result.filters![0].column).toBe('status');

      // Should have HAVING filters (post-aggregation)
      expect(result.havingFilters).toHaveLength(2);
      expect(
        result.havingFilters!.find((f) => f.column === 'value'),
      ).toBeDefined();
      expect(
        result.havingFilters!.find((f) => f.column === 'COUNT(*)'),
      ).toBeDefined();
    });

    it('should put all filters in WHERE for non-aggregated chart', () => {
      const config = {
        xAxis: 'category',
        yAxis: 'price',
        // No aggregation
        filters: [
          {
            column: 'status',
            operator: 'eq',
            value: 'active',
            type: 'text',
          },
          {
            column: 'price',
            operator: 'gt',
            value: '100',
            type: 'number',
          },
        ] as FilterCondition[],
      };

      const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);

      // All filters should go to WHERE (no aggregation)
      expect(result.filters).toHaveLength(2);
      expect(result.havingFilters).toHaveLength(0);
    });

    it('should handle time aggregation charts with mixed filters', () => {
      const config = {
        xAxis: 'created_at',
        yAxis: 'revenue',
        aggregation: 'sum',
        timeAggregation: 'month',
        filters: [
          {
            column: 'region',
            operator: 'eq',
            value: 'US',
            type: 'text',
          },
          {
            column: 'SUM(revenue)',
            operator: 'gt',
            value: '10000',
            type: 'number',
          },
        ] as FilterCondition[],
      };

      const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);

      expect(result.filters).toHaveLength(1);
      expect(result.filters![0].column).toBe('region');

      expect(result.havingFilters).toHaveLength(1);
      expect(result.havingFilters![0].column).toBe('SUM(revenue)');
    });
  });

  describe('Filter categorization for metric widgets', () => {
    it('should categorize filters correctly for metric widgets', () => {
      const metricWidget = { ...mockWidget, widgetType: 'metric' };

      const config = {
        metric: 'revenue',
        aggregation: 'sum',
        filters: [
          {
            column: 'category',
            operator: 'eq',
            value: 'electronics',
            type: 'text',
          },
          {
            column: 'value',
            operator: 'gt',
            value: '1000',
            type: 'number',
          },
        ] as FilterCondition[],
      };

      const result = WidgetQueryBuilder.buildQueryParams(metricWidget, config);

      // Metrics are always aggregated
      expect(result.filters).toHaveLength(1);
      expect(result.filters![0].column).toBe('category');

      expect(result.havingFilters).toHaveLength(1);
      expect(result.havingFilters![0].column).toBe('value');
    });
  });

  describe('Filter categorization for table widgets', () => {
    it('should put all filters in WHERE for table widgets', () => {
      const tableWidget = { ...mockWidget, widgetType: 'table' };

      const config = {
        columns: ['id', 'name', 'price'],
        filters: [
          {
            column: 'status',
            operator: 'eq',
            value: 'active',
            type: 'text',
          },
          {
            column: 'value',
            operator: 'gt',
            value: '100',
            type: 'number',
          },
        ] as FilterCondition[],
      };

      const result = WidgetQueryBuilder.buildQueryParams(tableWidget, config);

      // Tables are not aggregated - all filters go to WHERE
      expect(result.filters).toHaveLength(2);
      expect(result.havingFilters).toHaveLength(0);
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain backward compatibility with existing filter configurations', () => {
      const config = {
        xAxis: 'month',
        yAxis: '*',
        aggregation: 'count',
        groupBy: 'category',
        filters: [
          {
            column: 'created_at',
            operator: 'gte',
            value: '2024-01-01',
            type: 'date',
          },
          {
            column: 'count',
            operator: 'gt',
            value: '50',
            type: 'number',
          },
        ] as FilterCondition[],
      };

      // This should not throw an error and should auto-categorize filters
      const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);

      expect(result.filters).toBeDefined();
      expect(result.havingFilters).toBeDefined();
      expect(result.filters!.length + result.havingFilters!.length).toBe(2);
    });

    it('should handle empty filters gracefully', () => {
      const config = {
        xAxis: 'category',
        yAxis: '*',
        aggregation: 'count',
        filters: [],
      };

      const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);

      expect(result.filters).toHaveLength(0);
      expect(result.havingFilters).toHaveLength(0);
    });

    it('should handle missing filters field gracefully', () => {
      const config = {
        xAxis: 'category',
        yAxis: '*',
        aggregation: 'count',
        // No filters field
      };

      const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);

      expect(result.filters).toHaveLength(0);
      expect(result.havingFilters).toHaveLength(0);
    });
  });

  describe('Widget type detection', () => {
    it('should correctly identify aggregated chart widgets', () => {
      const configs = [
        { aggregation: 'count' },
        { groupBy: 'category' },
        { timeAggregation: 'month' },
        { aggregation: 'sum', groupBy: 'region' },
      ];

      configs.forEach((config) => {
        const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);
        // Should have categorized filters properly (even if empty)
        expect(result).toHaveProperty('filters');
        expect(result).toHaveProperty('havingFilters');
      });
    });

    it('should correctly identify non-aggregated chart widgets', () => {
      const config = {
        xAxis: 'name',
        yAxis: 'price',
        // No aggregation, groupBy, or timeAggregation
      };

      const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);

      // Should not create HAVING filters for non-aggregated widgets
      expect(result.havingFilters).toHaveLength(0);
    });
  });
});
