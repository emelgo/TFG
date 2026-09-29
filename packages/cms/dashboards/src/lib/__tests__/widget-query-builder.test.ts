/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import { WidgetConfig, WidgetQueryBuilder } from '../widget-query-builder';

describe('WidgetQueryBuilder', () => {
  describe('buildQueryParams', () => {
    const mockWidget = {
      schemaName: 'public',
      tableName: 'orders',
      widgetType: 'chart',
    };

    it('should build chart query parameters correctly', () => {
      const config: WidgetConfig = {
        xAxis: 'created_at',
        yAxis: 'revenue',
        aggregation: 'sum',
        groupBy: 'status',
        timeAggregation: 'day',
        filters: [],
      };

      const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);

      expect(result).toEqual({
        schemaName: 'public',
        tableName: 'orders',
        page: 1,
        pageSize: 100,
        filters: [],
        havingFilters: [],
        xAxis: 'created_at',
        yAxis: 'revenue',
        aggregation: 'SUM',
        groupBy: ['status'],
        timeAggregation: 'day',
      });
    });

    it('should handle chart without yAxis (count of records)', () => {
      const config: WidgetConfig = {
        xAxis: 'created_at',
        aggregation: 'count',
        filters: [],
      };

      const result = WidgetQueryBuilder.buildQueryParams(mockWidget, config);

      expect(result.yAxis).toBe('*');
      expect(result.aggregation).toBe('COUNT');
    });

    it('should build metric query parameters correctly', () => {
      const metricWidget = { ...mockWidget, widgetType: 'metric' };
      const config: WidgetConfig = {
        metric: 'revenue',
        aggregation: 'avg',
        filters: [],
      };

      const result = WidgetQueryBuilder.buildQueryParams(metricWidget, config);

      expect(result).toEqual({
        schemaName: 'public',
        tableName: 'orders',
        page: 1,
        pageSize: 100,
        filters: [],
        havingFilters: [],
        aggregation: 'AVG',
        aggregationColumn: 'revenue',
      });
    });

    it('should build table query parameters correctly', () => {
      const tableWidget = { ...mockWidget, widgetType: 'table' };
      const config: WidgetConfig = {
        columns: ['id', 'name', 'status'],
        filters: [],
      };

      const result = WidgetQueryBuilder.buildQueryParams(tableWidget, config);

      expect(result).toEqual({
        schemaName: 'public',
        tableName: 'orders',
        page: 1,
        pageSize: 100,
        filters: [],
        havingFilters: [],
        properties: {
          columns: ['id', 'name', 'status'],
        },
      });
    });

    it('should handle custom pagination', () => {
      const config: WidgetConfig = { filters: [] };
      const pagination = { page: 3, pageSize: 50 };

      const result = WidgetQueryBuilder.buildQueryParams(
        mockWidget,
        config,
        pagination,
      );

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(50);
    });

    it('should throw error for unsupported widget type', () => {
      const invalidWidget = { ...mockWidget, widgetType: 'invalid' };
      const config: WidgetConfig = { filters: [] };

      expect(() =>
        WidgetQueryBuilder.buildQueryParams(invalidWidget, config),
      ).toThrow('Unsupported widget type: invalid');
    });
  });

  describe('buildTableQueryParamsWithFilters', () => {
    const mockWidget = {
      schemaName: 'public',
      tableName: 'users',
      widgetType: 'table',
    };

    it('should build enhanced table query parameters', () => {
      const config: WidgetConfig = {
        columns: ['id', 'name', 'email'],
        filters: [{ column: 'status', operator: 'eq', value: 'active' }],
      };

      const searchParams = {
        page: 2,
        pageSize: 25,
        search: 'john',
        sortColumn: 'name',
        sortDirection: 'desc' as const,
      };

      const result = WidgetQueryBuilder.buildTableQueryParamsWithFilters(
        mockWidget,
        config,
        searchParams,
      );

      expect(result).toEqual({
        schemaName: 'public',
        tableName: 'users',
        page: 2,
        pageSize: 25,
        filters: [{ column: 'status', operator: 'eq', value: 'active' }],
        properties: { columns: ['id', 'name', 'email'] },
        search: 'john',
        sortColumn: 'name',
        sortDirection: 'desc',
      });
    });

    it('should throw error for non-table widgets', () => {
      const chartWidget = { ...mockWidget, widgetType: 'chart' };
      const config: WidgetConfig = { filters: [] };
      const searchParams = { page: 1, pageSize: 10 };

      expect(() =>
        WidgetQueryBuilder.buildTableQueryParamsWithFilters(
          chartWidget,
          config,
          searchParams,
        ),
      ).toThrow('This method only supports table widgets');
    });
  });

  describe('parseWidgetConfig', () => {
    it('should parse JSON string configuration', () => {
      const jsonConfig = '{"xAxis": "date", "yAxis": "count"}';
      const result = WidgetQueryBuilder.parseWidgetConfig(jsonConfig);

      expect(result).toEqual({ xAxis: 'date', yAxis: 'count' });
    });

    it('should parse object configuration', () => {
      const objectConfig = { xAxis: 'date', yAxis: 'count' };
      const result = WidgetQueryBuilder.parseWidgetConfig(objectConfig);

      expect(result).toEqual({ xAxis: 'date', yAxis: 'count' });
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = '{ invalid json }';

      expect(() => WidgetQueryBuilder.parseWidgetConfig(invalidJson)).toThrow(
        'Invalid JSON configuration',
      );
    });

    it('should return empty object for null/undefined', () => {
      expect(WidgetQueryBuilder.parseWidgetConfig(null)).toEqual({});
      expect(WidgetQueryBuilder.parseWidgetConfig(undefined)).toEqual({});
    });
  });

  describe('validateWidgetConfig', () => {
    it('should validate chart configuration', () => {
      const validConfig: WidgetConfig = { xAxis: 'date' };
      const result = WidgetQueryBuilder.validateWidgetConfig(
        'chart',
        validConfig,
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should catch chart validation errors', () => {
      const invalidConfig: WidgetConfig = {};
      const result = WidgetQueryBuilder.validateWidgetConfig(
        'chart',
        invalidConfig,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Chart widgets require xAxis configuration',
      );
    });

    it('should validate metric and table configurations', () => {
      const config: WidgetConfig = {};

      const metricResult = WidgetQueryBuilder.validateWidgetConfig(
        'metric',
        config,
      );
      const tableResult = WidgetQueryBuilder.validateWidgetConfig(
        'table',
        config,
      );

      expect(metricResult.isValid).toBe(true);
      expect(tableResult.isValid).toBe(true);
    });

    it('should reject unsupported widget types', () => {
      const config: WidgetConfig = {};
      const result = WidgetQueryBuilder.validateWidgetConfig('invalid', config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unsupported widget type: invalid');
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default chart configuration', () => {
      const result = WidgetQueryBuilder.getDefaultConfig('chart');

      expect(result).toEqual({
        aggregation: 'count',
        yAxis: '*',
      });
    });

    it('should return default metric configuration', () => {
      const result = WidgetQueryBuilder.getDefaultConfig('metric');

      expect(result).toEqual({
        aggregation: 'count',
        metric: '*',
      });
    });

    it('should return default table configuration', () => {
      const result = WidgetQueryBuilder.getDefaultConfig('table');

      expect(result).toEqual({
        columns: [],
      });
    });

    it('should return empty config for unknown types', () => {
      const result = WidgetQueryBuilder.getDefaultConfig('unknown');

      expect(result).toEqual({});
    });
  });

  describe('extractWidgetFilters', () => {
    it('should extract filters from configuration', () => {
      const config: WidgetConfig = {
        filters: [
          { column: 'status', operator: 'eq', value: 'active' },
          { column: 'date', operator: 'gt', value: '2023-01-01' },
        ],
      };

      const result = WidgetQueryBuilder.extractWidgetFilters(config);

      expect(result).toEqual(config.filters);
    });

    it('should return empty array when no filters', () => {
      const config: WidgetConfig = {};
      const result = WidgetQueryBuilder.extractWidgetFilters(config);

      expect(result).toEqual([]);
    });
  });
});
