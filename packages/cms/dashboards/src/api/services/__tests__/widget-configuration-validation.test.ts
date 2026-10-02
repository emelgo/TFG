import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Import the service after mocking
import { createWidgetsService } from '../widgets.service';

// Mock all external dependencies before importing the service
const mockMetadataService = {
  getTableMetadata: vi.fn(),
};

vi.mock('@pymekit/cms-supabase/client', () => ({
  getDrizzleSupabaseAdminClient: vi.fn(),
}));

vi.mock('@pymekit/cms-data-explorer-core', () => ({
  createTableMetadataService: () => mockMetadataService,
  createTableQueryService: () => ({
    queryTableData: vi.fn().mockResolvedValue({
      data: [],
      totalCount: 0,
      pageCount: 0,
    }),
  }),
}));

vi.mock('../../lib/filters/dashboard-filter-adapter', () => ({
  adaptFiltersForBackend: vi.fn((filters) => filters),
}));

vi.mock('../../lib/widget-query-builder', () => ({
  WidgetQueryBuilder: {
    parseWidgetConfig: vi.fn((config) => config),
    buildQueryParams: vi.fn().mockReturnValue({
      schemaName: 'public',
      tableName: 'test_table',
      page: 1,
      pageSize: 100,
    }),
  },
}));

vi.mock('../../lib/metric-trend-calculator', () => ({
  calculateMetricTrend: vi.fn().mockResolvedValue({
    data: [],
    metadata: {
      totalCount: 0,
      pageCount: 0,
      lastUpdated: new Date().toISOString(),
    },
  }),
}));

describe('Widget Configuration Validation', () => {
  let service: ReturnType<typeof createWidgetsService>;
  let mockContext: Context;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {} as Context;
    service = createWidgetsService(mockContext);
  });

  describe('Time aggregation validation', () => {
    it('should allow time aggregation for date columns', async () => {
      // Mock metadata response with date column
      mockMetadataService.getTableMetadata.mockResolvedValue({
        columns: [
          {
            name: 'created_at',
            ui_config: { data_type: 'timestamp with time zone' },
          },
        ],
      });

      const widgetConfig = {
        schemaName: 'public',
        tableName: 'test_table',
        widgetType: 'chart',
        config: {
          xAxis: 'created_at',
          timeAggregation: 'day',
          aggregation: 'COUNT',
          yAxis: '*',
        },
      };

      await service.getPreviewData(widgetConfig);

      // Verify metadata was fetched
      expect(mockMetadataService.getTableMetadata).toHaveBeenCalledWith({
        schemaName: 'public',
        tableName: 'test_table',
      });
    });

    it('should disable time aggregation for non-date columns', async () => {
      // Mock metadata response with text column
      mockMetadataService.getTableMetadata.mockResolvedValue({
        columns: [
          {
            name: 'email',
            ui_config: { data_type: 'character varying' },
          },
        ],
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const widgetConfig = {
        schemaName: 'public',
        tableName: 'test_table',
        widgetType: 'chart',
        config: {
          xAxis: 'email',
          timeAggregation: 'day',
          aggregation: 'COUNT',
          yAxis: '*',
        },
      };

      await service.getPreviewData(widgetConfig);

      // Verify warning was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Time aggregation disabled for non-date column',
        ),
      );

      consoleSpy.mockRestore();
    });

    it('should handle missing columns gracefully', async () => {
      // Mock metadata response without the requested column
      mockMetadataService.getTableMetadata.mockResolvedValue({
        columns: [
          {
            name: 'other_column',
            ui_config: { data_type: 'text' },
          },
        ],
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const widgetConfig = {
        schemaName: 'public',
        tableName: 'test_table',
        widgetType: 'chart',
        config: {
          xAxis: 'missing_column',
          timeAggregation: 'day',
          aggregation: 'COUNT',
          yAxis: '*',
        },
      };

      // Should disable time aggregation and continue, not throw
      await service.getPreviewData(widgetConfig);

      // Verify that time aggregation was disabled due to validation error
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to validate widget configuration, disabling time aggregation:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should disable time aggregation when metadata fetch fails', async () => {
      // Mock metadata service to fail
      mockMetadataService.getTableMetadata.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const widgetConfig = {
        schemaName: 'public',
        tableName: 'test_table',
        widgetType: 'chart',
        config: {
          xAxis: 'created_at',
          timeAggregation: 'day',
          aggregation: 'COUNT',
          yAxis: '*',
        },
      };

      await service.getPreviewData(widgetConfig);

      // Verify warning was logged with the error object
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to validate widget configuration, disabling time aggregation:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should not validate non-chart widgets', async () => {
      // Mock successful metadata response
      mockMetadataService.getTableMetadata.mockResolvedValue({
        columns: [
          {
            name: 'name',
            ui_config: { data_type: 'text' },
          },
          {
            name: 'email',
            ui_config: { data_type: 'character varying' },
          },
        ],
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const widgetConfig = {
        schemaName: 'public',
        tableName: 'test_table',
        widgetType: 'table',
        config: {
          columns: ['name', 'email'],
        },
      };

      await service.getPreviewData(widgetConfig);

      // Verify no warnings (table widgets don't validate time aggregation)
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not validate charts without time aggregation', async () => {
      // Mock successful metadata response
      mockMetadataService.getTableMetadata.mockResolvedValue({
        columns: [
          {
            name: 'category',
            ui_config: { data_type: 'text' },
          },
        ],
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const widgetConfig = {
        schemaName: 'public',
        tableName: 'test_table',
        widgetType: 'chart',
        config: {
          xAxis: 'category',
          aggregation: 'COUNT',
          yAxis: '*',
          // No timeAggregation
        },
      };

      await service.getPreviewData(widgetConfig);

      // Verify no warnings (no time aggregation to validate)
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should validate all supported date types', async () => {
      // Time-of-day types are deliberately absent — see isDateColumn.
      const dateTypes = [
        'date',
        'timestamp',
        'timestamp with time zone',
        'timestamp without time zone',
        'timestamptz',
      ];

      for (const dataType of dateTypes) {
        mockMetadataService.getTableMetadata.mockResolvedValue({
          columns: [
            {
              name: 'time_col',
              ui_config: { data_type: dataType },
            },
          ],
        });

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

        const widgetConfig = {
          schemaName: 'public',
          tableName: 'test_table',
          widgetType: 'chart',
          config: {
            xAxis: 'time_col',
            timeAggregation: 'day',
            aggregation: 'COUNT',
            yAxis: '*',
          },
        };

        await service.getPreviewData(widgetConfig);

        // Should not warn for valid date types
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      }
    });
  });

  describe('Data path consistency', () => {
    it('should use same validation for both preview and widget data', async () => {
      // Mock a widget in the database
      const mockGetWidget = vi.spyOn(service, 'getWidget').mockResolvedValue({
        id: 'test-widget',
        dashboardId: 'test-dashboard',
        title: 'Test Widget',
        position: { x: 0, y: 0, w: 1, h: 1 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        schemaName: 'public',
        tableName: 'test_table',
        widgetType: 'chart',
        config: JSON.stringify({
          xAxis: 'email',
          timeAggregation: 'day',
          aggregation: 'COUNT',
          yAxis: '*',
        }),
      });

      mockMetadataService.getTableMetadata.mockResolvedValue({
        columns: [
          {
            name: 'email',
            ui_config: { data_type: 'character varying' },
          },
        ],
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      // Test both preview and widget data paths
      const widgetConfig = {
        schemaName: 'public',
        tableName: 'test_table',
        widgetType: 'chart',
        config: {
          xAxis: 'email',
          timeAggregation: 'day',
          aggregation: 'COUNT',
          yAxis: '*',
        },
      };

      await service.getPreviewData(widgetConfig);
      await service.getWidgetData('test-widget');

      // Both should trigger the same validation
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Time aggregation disabled for non-date column',
        ),
      );

      consoleSpy.mockRestore();
      mockGetWidget.mockRestore();
    });
  });
});
