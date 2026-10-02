import { describe, expect, it, vi } from 'vitest';

import { WidgetQueryBuilder } from '../lib/widget-query-builder';

/**
 * Regression tests to ensure DATE_TRUNC is never applied to non-date columns
 * These tests prevent the original issue from reoccurring
 */
describe('DATE_TRUNC Regression Tests', () => {
  describe('Widget Query Builder', () => {
    it('should build chart query params without xAxisDataType pollution', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'accounts',
        widgetType: 'chart',
      };

      const config = {
        xAxis: 'email',
        yAxis: '*',
        aggregation: 'COUNT',
        timeAggregation: 'day',
      };

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      // Ensure we don't pass invalid data type information
      expect(queryParams).not.toHaveProperty('xAxisDataType');
      expect(queryParams.timeAggregation).toBe('day');
      expect(queryParams.xAxis).toBe('email');
    });

    it('should handle chart configuration without time aggregation', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'accounts',
        widgetType: 'chart',
      };

      const config = {
        xAxis: 'category',
        yAxis: 'amount',
        aggregation: 'SUM',
        // No timeAggregation
      };

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      expect(queryParams.timeAggregation).toBeUndefined();
      expect(queryParams.xAxis).toBe('category');
      expect(queryParams.yAxis).toBe('amount');
      expect(queryParams.aggregation).toBe('SUM');
    });

    it('should handle metric widgets without chart-specific params', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'orders',
        widgetType: 'metric',
      };

      const config = {
        metric: 'total_amount',
        aggregation: 'SUM',
      };

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      expect(queryParams.aggregationColumn).toBe('total_amount');
      expect(queryParams.aggregation).toBe('SUM');
      expect(queryParams.xAxis).toBeUndefined();
      expect(queryParams.timeAggregation).toBeUndefined();
    });

    it('should handle table widgets with column specifications', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'users',
        widgetType: 'table',
      };

      const config = {
        columns: ['name', 'email', 'created_at'],
      };

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      expect(queryParams.properties).toEqual({
        columns: ['name', 'email', 'created_at'],
      });
      expect(queryParams.xAxis).toBeUndefined();
      expect(queryParams.timeAggregation).toBeUndefined();
    });
  });

  describe('Configuration Validation Edge Cases', () => {
    it('should handle config with time aggregation but no xAxis', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'events',
        widgetType: 'chart',
      };

      const config = {
        yAxis: '*',
        aggregation: 'COUNT',
        timeAggregation: 'hour',
        // Missing xAxis
      };

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      expect(queryParams.timeAggregation).toBe('hour');
      expect(queryParams.xAxis).toBeUndefined();
    });

    it('should handle config with xAxis but no time aggregation', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'products',
        widgetType: 'chart',
      };

      const config = {
        xAxis: 'category',
        yAxis: 'price',
        aggregation: 'AVG',
        // No timeAggregation
      };

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      expect(queryParams.xAxis).toBe('category');
      expect(queryParams.timeAggregation).toBeUndefined();
    });

    it('should normalize aggregation types consistently', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'sales',
        widgetType: 'chart',
      };

      const config = {
        xAxis: 'date',
        yAxis: 'amount',
        aggregation: 'sum', // lowercase
      };

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      expect(queryParams.aggregation).toBe('SUM'); // Should be normalized to uppercase
    });

    it('should handle empty or invalid configurations gracefully', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'test',
        widgetType: 'chart',
      };

      const config = {}; // Empty config

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      expect(queryParams.schemaName).toBe('public');
      expect(queryParams.tableName).toBe('test');
      expect(queryParams.xAxis).toBeUndefined();
      expect(queryParams.timeAggregation).toBeUndefined();
    });
  });

  describe('Query Parameter Structure', () => {
    it('should always include base parameters', () => {
      const widget = {
        schemaName: 'test_schema',
        tableName: 'test_table',
        widgetType: 'chart',
      };

      const config = {
        xAxis: 'timestamp_col',
        yAxis: '*',
        aggregation: 'COUNT',
        timeAggregation: 'day',
      };

      const pagination = { page: 2, pageSize: 50 };

      const queryParams = WidgetQueryBuilder.buildQueryParams(
        widget,
        config,
        pagination,
      );

      expect(queryParams.schemaName).toBe('test_schema');
      expect(queryParams.tableName).toBe('test_table');
      expect(queryParams.page).toBe(2);
      expect(queryParams.pageSize).toBe(50);
    });

    it('should use default pagination when not provided', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'test',
        widgetType: 'chart',
      };

      const config = {
        xAxis: 'col',
        yAxis: '*',
        aggregation: 'COUNT',
      };

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      expect(queryParams.page).toBe(1);
      expect(queryParams.pageSize).toBe(100);
    });

    it('should preserve filter categorization', () => {
      const widget = {
        schemaName: 'public',
        tableName: 'orders',
        widgetType: 'chart',
      };

      const config = {
        xAxis: 'created_at',
        yAxis: 'amount',
        aggregation: 'SUM',
        filters: [
          {
            column: 'status',
            operator: 'eq',
            value: 'completed',
            type: 'text',
          },
        ],
      };

      const queryParams = WidgetQueryBuilder.buildQueryParams(widget, config);

      expect(queryParams.filters).toBeDefined();
      expect(queryParams.filters).toHaveLength(1);
      expect(queryParams.filters![0].column).toBe('status');
    });
  });
});
