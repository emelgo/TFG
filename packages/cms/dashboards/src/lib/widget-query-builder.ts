import type { TableQueryParams } from '@pymekit/cms-data-explorer-core';
import { TableQueryBuilder } from '@pymekit/cms-data-explorer-core/query-builder';
import type { FilterCondition } from '@pymekit/cms-filters-core';

/**
 * Widget configuration interface for type safety
 */
export interface WidgetConfig {
  readonly [key: string]: unknown;
  filters?: FilterCondition[];
  columns?: string[];
  xAxis?: string;
  yAxis?: string;
  aggregation?: string;
  groupBy?: string;
  timeAggregation?: string;
  metric?: string;
}

/**
 * Widget query builder that extracts algorithmic logic from the service
 * This class is purely functional and testable without database dependencies
 */
export class WidgetQueryBuilder {
  /**
   * Build query parameters for a widget based on its type and configuration
   */
  static buildQueryParams(
    widget: {
      schemaName: string;
      tableName: string;
      widgetType: string;
    },
    config: WidgetConfig,
    pagination?: { page: number; pageSize: number },
  ): TableQueryParams {
    const baseParams: TableQueryParams = {
      schemaName: widget.schemaName,
      tableName: widget.tableName,
      page: pagination?.page || 1,
      pageSize: pagination?.pageSize || 100,
    };

    // Smart filter categorization for backward compatibility
    const rawFilters = config.filters || [];
    const isAggregated = this.isAggregatedWidget(widget.widgetType, config);

    const { whereFilters, havingFilters } = TableQueryBuilder.categorizeFilters(
      rawFilters,
      {
        isAggregated,
        yAxis: config.yAxis,
        aggregation: config.aggregation,
      },
    );

    // Apply categorized filters
    baseParams.filters = whereFilters;
    baseParams.havingFilters = havingFilters;

    switch (widget.widgetType) {
      case 'chart':
        return this.buildChartQueryParams(baseParams, config);

      case 'metric':
        return this.buildMetricQueryParams(baseParams, config);

      case 'table':
        return this.buildTableQueryParams(baseParams, config);
      default:
        throw new Error(`Unsupported widget type: ${widget.widgetType}`);
    }
  }

  /**
   * Build query parameters for chart widgets
   */
  private static buildChartQueryParams(
    baseParams: TableQueryParams,
    config: WidgetConfig,
  ): TableQueryParams {
    const xAxis = config.xAxis as string;
    const yAxis = config.yAxis as string;
    const aggregation = this.normalizeAggregation(config.aggregation as string);
    const groupBy = config.groupBy as string;
    const timeAggregation = config.timeAggregation as string;

    return {
      ...baseParams,
      xAxis,
      yAxis: yAxis || '*',
      aggregation,
      groupBy: groupBy ? [groupBy] : undefined,
      timeAggregation,
    };
  }

  /**
   * Build query parameters for metric widgets
   */
  private static buildMetricQueryParams(
    baseParams: TableQueryParams,
    config: WidgetConfig,
  ): TableQueryParams {
    const metric = config.metric as string;
    const aggregation = this.normalizeAggregation(config.aggregation as string);

    return {
      ...baseParams,
      aggregation,
      aggregationColumn: metric || '*',
    };
  }

  /**
   * Build query parameters for table widgets
   */
  private static buildTableQueryParams(
    baseParams: TableQueryParams,
    config: WidgetConfig,
  ): TableQueryParams {
    const columns = config.columns;

    return {
      ...baseParams,
      properties:
        columns && Array.isArray(columns) && columns.length > 0
          ? { columns }
          : undefined,
    };
  }

  /**
   * Build enhanced table query parameters with search and sorting
   */
  static buildTableQueryParamsWithFilters(
    widget: {
      schemaName: string;
      tableName: string;
      widgetType: string;
    },
    config: WidgetConfig,
    searchParams: {
      page: number;
      pageSize: number;
      search?: string;
      sortColumn?: string;
      sortDirection?: 'asc' | 'desc';
    },
  ): TableQueryParams {
    if (widget.widgetType !== 'table') {
      throw new Error('This method only supports table widgets');
    }

    const properties = this.extractTableProperties(config);
    const widgetFilters = config.filters || [];

    return {
      schemaName: widget.schemaName,
      tableName: widget.tableName,
      page: searchParams.page,
      pageSize: searchParams.pageSize,
      filters: widgetFilters,
      properties,
      search: searchParams.search,
      sortColumn: searchParams.sortColumn,
      sortDirection: searchParams.sortDirection,
    };
  }

  /**
   * Parse widget configuration from various formats
   */
  static parseWidgetConfig(config: unknown): WidgetConfig {
    if (typeof config === 'string') {
      try {
        return JSON.parse(config) as WidgetConfig;
      } catch {
        throw new Error('Invalid JSON configuration');
      }
    }

    if (typeof config === 'object' && config !== null) {
      return config as WidgetConfig;
    }

    return {};
  }

  /**
   * Extract widget filters from configuration
   */
  static extractWidgetFilters(config: WidgetConfig): FilterCondition[] {
    return config.filters || [];
  }

  /**
   * Determine if a widget uses aggregation (and thus might need HAVING clauses)
   */
  private static isAggregatedWidget(
    widgetType: string,
    config: WidgetConfig,
  ): boolean {
    switch (widgetType) {
      case 'chart':
        // Charts are aggregated if they have aggregation, groupBy, or timeAggregation
        return !!(
          config.aggregation ||
          config.groupBy ||
          config.timeAggregation
        );
      case 'metric':
        // Metrics are always aggregated
        return true;
      case 'table':
        // Tables are not aggregated (unless they have specific aggregation config)
        return false;
      default:
        return false;
    }
  }

  /**
   * Normalize aggregation function names
   */
  private static normalizeAggregation(aggregation: string | undefined): string {
    if (!aggregation) {
      return 'COUNT';
    }

    return aggregation.toUpperCase();
  }

  /**
   * Extract table properties from configuration
   */
  private static extractTableProperties(config: WidgetConfig) {
    const columns = config.columns;

    return columns && Array.isArray(columns) && columns.length > 0
      ? { columns }
      : undefined;
  }

  /**
   * Validate widget configuration
   */
  static validateWidgetConfig(
    widgetType: string,
    config: WidgetConfig,
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    switch (widgetType) {
      case 'chart':
        if (!config.xAxis) {
          errors.push('Chart widgets require xAxis configuration');
        }

        break;

      case 'metric':
        // Metrics can work with default configuration
        break;

      case 'table':
        // Tables can work with default configuration (show all columns)
        break;

      default:
        errors.push(`Unsupported widget type: ${widgetType}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get default configuration for a widget type
   */
  static getDefaultConfig(widgetType: string): WidgetConfig {
    switch (widgetType) {
      case 'chart':
        return {
          aggregation: 'count',
          yAxis: '*',
        };

      case 'metric':
        return {
          aggregation: 'count',
          metric: '*',
        };

      case 'table':
        return {
          columns: [],
        };
      default:
        return {};
    }
  }
}
