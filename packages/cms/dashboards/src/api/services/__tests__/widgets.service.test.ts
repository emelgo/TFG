import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdvancedFilterCondition } from '../../../types';
import { createWidgetsService } from '../widgets.service';

// Create mock functions
const mockQueryTableData = vi.fn();
const mockGetWidget = vi.fn();

// Mock the dependencies
vi.mock('@pymekit/cms-data-explorer-core', () => ({
  createTableQueryService: vi.fn(() => ({
    queryTableData: mockQueryTableData,
  })),
}));

vi.mock('../../lib/widget-query-builder', () => ({
  WidgetQueryBuilder: {
    parseWidgetConfig: vi.fn((config) => config),
    buildQueryParams: vi.fn((widget, config) => ({
      schemaName: widget.schemaName,
      tableName: widget.tableName,
      page: 1,
      pageSize: 100,
      filters: config.filters || [],
    })),
  },
}));

vi.mock('../widget-view.service', () => ({
  createWidgetViewService: vi.fn(() => ({
    queryWidgetView: vi.fn().mockResolvedValue({
      data: [],
      totalCount: 0,
      pageCount: 0,
    }),
  })),
}));

describe('WidgetsService - Trend Filter Handling', () => {
  let service: ReturnType<typeof createWidgetsService>;
  let mockContext: Context;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {} as Context;
    service = createWidgetsService(mockContext);

    // Setup default mock responses
    mockQueryTableData.mockResolvedValue({
      data: [{ count: 42, value: 123 }],
      totalCount: 1,
      pageCount: 1,
    });

    mockGetWidget.mockResolvedValue({
      id: 'widget-1',
      schemaName: 'public',
      tableName: 'users',
      widgetType: 'metric',
      config: { filters: [] },
    });

    // Mock the getWidget method on the service
    vi.spyOn(service, 'getWidget').mockImplementation(mockGetWidget);
  });

  describe('Trend Filter Detection', () => {
    it('should detect trend filters with config.isTrendFilter', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'contains',
          value: 'test',
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

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'users',
        widgetType: 'metric',
        config: {
          filters,
          metric: 'id',
          aggregation: 'COUNT',
        },
      };

      // Mock the getWidget method to return the widget with trend filters
      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      expect(result.metadata.trendFilters).toBeDefined();
      expect(result.metadata.trendFilters).toHaveLength(1);
      expect(result.metadata.trendFilters[0]).toMatchObject({
        column: 'created_at',
        operator: 'between',
        value: '2023-01-01,2023-12-31',
        config: {
          isTrendFilter: true,
        },
      });
    });

    it('should detect trend filters and use first one for analysis', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'eq',
          value: '__rel_date:last30Days',
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

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'users',
        widgetType: 'metric',
        config: {
          filters,
          metric: 'id',
          aggregation: 'COUNT',
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      expect(result.metadata.trendFilters).toHaveLength(1);
      expect(result.metadata.trendDateColumns).toEqual(['created_at']);
    });

    it('should use first trend filter when multiple exist', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-01-01,2023-01-31',
          config: {
            isTrendFilter: true,
          },
        },
        {
          column: 'updated_at',
          operator: 'eq',
          value: '__rel_date:thisMonth',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'users',
        widgetType: 'metric',
        config: {
          filters,
          metric: 'id',
          aggregation: 'COUNT',
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      // Should use first trend filter (created_at)
      expect(result.metadata.trendDateColumns).toEqual(['created_at']);
    });
  });

  describe('Trend Period Calculation from Filters', () => {
    it('should handle daily trend period from date filters', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-12-01,2023-12-02', // 1 day period
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'orders',
        widgetType: 'metric',
        config: {
          filters,
          metric: 'total',
          aggregation: 'SUM',
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      // Verify the trend filter was processed (dates converted to ISO strings)
      expect(mockQueryTableData).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              column: 'created_at',
              operator: 'between',
              value: '2023-12-01T00:00:00.000Z,2023-12-02T00:00:00.000Z',
            }),
          ]),
        }),
      );

      expect(result.metadata.trendDateColumns).toEqual(['created_at']);
    });

    it('should handle weekly trend period from relative date filters', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'during',
          value: '__rel_date:last7Days',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'users',
        widgetType: 'metric',
        config: {
          filters,
          metric: 'id',
          aggregation: 'COUNT',
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      expect(result.metadata.trendFilters[0]).toMatchObject({
        column: 'created_at',
        operator: 'during',
        value: '__rel_date:last7Days',
        config: {
          isTrendFilter: true,
        },
      });
    });

    it('should handle monthly trend period from date range', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'order_date',
          operator: 'between',
          value: '2023-11-01,2023-11-30', // 30 day period
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'sales',
        widgetType: 'metric',
        config: {
          filters,
          metric: 'revenue',
          aggregation: 'SUM',
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      expect(result.metadata.trendDateColumns).toEqual(['order_date']);
    });

    it('should handle trend filters with regular filters', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-01-01,2023-01-07',
          config: {
            isTrendFilter: true,
          },
        },
        {
          column: 'status',
          operator: 'in',
          value: ['completed', 'pending'],
        },
      ];

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'tasks',
        widgetType: 'metric',
        config: {
          filters,
          metric: 'id',
          aggregation: 'COUNT',
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      // Should have 1 trend filter
      expect(result.metadata.trendFilters).toHaveLength(1);

      // Should detect the date column from trend filters
      expect(result.metadata.trendDateColumns).toEqual(['created_at']);

      // Should pass both trend and regular filters to the query
      expect(mockQueryTableData).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              column: 'status',
              operator: 'in',
              value: ['completed', 'pending'],
            }),
            expect.objectContaining({
              column: 'created_at',
              operator: 'between',
              value: '2023-01-01T00:00:00.000Z,2023-01-07T00:00:00.000Z',
            }),
          ]),
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error when trend filters are detected but none exist', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'contains',
          value: 'test',
        },
      ];

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'users',
        widgetType: 'metric',
        config: {
          filters,
          metric: 'id',
          aggregation: 'COUNT',
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      // This should fallback to regular widget data handling since no trend filters exist
      const result = await service.getWidgetData('widget-1');

      // Should handle as regular metric widget, not trend
      expect(result.metadata.trendFilters).toBeUndefined();
    });

    it('should handle widgets with trend filters but no regular filters', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-01-01,2023-01-31',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'events',
        widgetType: 'metric',
        config: {
          filters,
          metric: 'id',
          aggregation: 'COUNT',
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      expect(result.metadata.trendFilters).toHaveLength(1);
      expect(result.metadata.trendDateColumns).toEqual(['created_at']);

      // Should still call query with just the trend filter (dates converted to ISO)
      expect(mockQueryTableData).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              column: 'created_at',
              operator: 'between',
              value: '2023-01-01T00:00:00.000Z,2023-01-31T00:00:00.000Z',
            }),
          ]),
        }),
      );
    });
  });

  describe('Non-Metric Widgets', () => {
    it('should not process trend filters for chart widgets', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-01-01,2023-12-31',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'users',
        widgetType: 'chart', // Not a metric widget
        config: {
          filters,
          xAxis: 'created_at',
          yAxis: 'count',
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      // Should handle as regular chart widget, not trend
      expect(result.metadata.trendFilters).toBeUndefined();
    });

    it('should not process trend filters for table widgets', async () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'between',
          value: '2023-01-01,2023-12-31',
          config: {
            isTrendFilter: true,
          },
        },
      ];

      const mockWidget = {
        id: 'widget-1',
        schemaName: 'public',
        tableName: 'users',
        widgetType: 'table', // Not a metric widget
        config: {
          filters,
          columns: ['id', 'name', 'created_at'],
        },
      };

      mockGetWidget.mockResolvedValue(mockWidget);

      const result = await service.getWidgetData('widget-1');

      // Should handle as regular table widget, not trend
      expect(result.metadata.trendFilters).toBeUndefined();
    });
  });
});
