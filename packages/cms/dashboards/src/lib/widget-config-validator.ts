import type { ColumnMetadata } from '@pymekit/cms-types';

import type { WidgetConfig } from './widget-query-builder';

/**
 * Widget configuration validator - pure functions for testing
 */
export class WidgetConfigValidator {
  /**
   * Validate and potentially modify widget configuration for safe query execution
   */
  static validateTimeAggregation(
    config: WidgetConfig,
    widgetType: string,
    columns: ColumnMetadata[],
  ): {
    config: WidgetConfig;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const validatedConfig = { ...config };

    // Only validate charts with time aggregation
    if (widgetType !== 'chart' || !config.timeAggregation || !config.xAxis) {
      return { config: validatedConfig, warnings };
    }

    const xAxisColumn = columns.find((col) => col.name === config.xAxis);

    if (!xAxisColumn) {
      throw new Error(
        `Column '${config.xAxis}' not found in table. Available columns: ${columns.map((c) => c.name).join(', ')}`,
      );
    }

    const dataType = xAxisColumn.ui_config?.data_type;

    if (!this.isDateColumn(dataType)) {
      // Remove time aggregation from config instead of failing
      validatedConfig.timeAggregation = undefined;
      warnings.push(
        `Time aggregation disabled for non-date column '${config.xAxis}' (type: ${dataType}). ` +
          `Time aggregation requires date/timestamp columns.`,
      );
    }

    return { config: validatedConfig, warnings };
  }

  /**
   * Check if a column data type supports DATE_TRUNC operations
   */
  static isDateColumn(dataType?: string): boolean {
    if (!dataType) return false;

    // Time-of-day types excluded: DATE_TRUNC returns 00:00:00 for every `time`
    // row, and has no overload at all for `time with time zone`.
    const dateTypes = [
      'date',
      'timestamp',
      'timestamp with time zone',
      'timestamp without time zone',
      'timestamptz',
    ];

    return dateTypes.includes(dataType.toLowerCase());
  }

  /**
   * Get available date columns from table metadata
   */
  static getDateColumns(columns: ColumnMetadata[]): ColumnMetadata[] {
    return columns.filter((col) => this.isDateColumn(col.ui_config?.data_type));
  }

  /**
   * Validate widget configuration comprehensively
   */
  static validateConfiguration(
    config: WidgetConfig,
    widgetType: string,
    columns: ColumnMetadata[],
  ): {
    config: WidgetConfig;
    warnings: string[];
    errors: string[];
  } {
    const errors: string[] = [];
    let warnings: string[] = [];
    let validatedConfig = { ...config };

    try {
      // Validate time aggregation
      const timeValidation = this.validateTimeAggregation(
        validatedConfig,
        widgetType,
        columns,
      );
      validatedConfig = timeValidation.config;
      warnings = warnings.concat(timeValidation.warnings);

      // Add more validations here as needed
      // - Validate aggregation functions for column types
      // - Validate filter compatibility
      // - Validate chart type requirements
    } catch (error) {
      errors.push((error as Error).message);
    }

    return { config: validatedConfig, warnings, errors };
  }

  /**
   * Check if a chart type requires date columns on x-axis
   */
  static requiresDateXAxis(chartType?: string): boolean {
    const timeDependentCharts = ['line', 'area'];
    return timeDependentCharts.includes(chartType || '');
  }

  /**
   * Get appropriate columns for a chart type
   */
  static getValidXAxisColumns(
    columns: ColumnMetadata[],
    chartType?: string,
  ): ColumnMetadata[] {
    if (this.requiresDateXAxis(chartType)) {
      return this.getDateColumns(columns);
    }

    // For other chart types, allow both categorical and date columns
    return columns.filter((col) => {
      const dataType = col.ui_config?.data_type?.toLowerCase();
      const categoricalTypes = [
        'text',
        'varchar',
        'character varying',
        'char',
        'enum',
      ];
      const dateTypes = [
        'date',
        'timestamp',
        'timestamp with time zone',
        'timestamp without time zone',
        'timestamptz',
        'time',
        'time with time zone',
        'time without time zone',
      ];

      return (
        categoricalTypes.includes(dataType || '') ||
        dateTypes.includes(dataType || '')
      );
    });
  }
}
