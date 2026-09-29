/**
 * Widget Options System
 *
 * Extensible system for widget-specific runtime options that affect data fetching
 * Start simple, expand as needed
 */

/**
 * Base widget options - can be extended by specific widget types
 */
export interface BaseWidgetOptions {
  refreshInterval?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Table widget options - currently the only widget type with runtime options
 */
export interface TableWidgetOptions extends BaseWidgetOptions {
  pagination?: {
    page: number;
    pageSize: number;
  };
  sorting?: {
    column: string;
    direction: 'asc' | 'desc';
  };
  search?: {
    query: string;
    columns?: string[];
  };
}

/**
 * Chart and metric widgets - no runtime options yet, but extensible
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ChartWidgetOptions extends BaseWidgetOptions {
  // Future: date ranges, grouping options, etc.
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MetricWidgetOptions extends BaseWidgetOptions {
  // Future: comparison periods, etc.
}

/**
 * Widget options mapping - makes it easy to add options to any widget type
 */
export type WidgetOptionsByType = {
  table: TableWidgetOptions;
  chart: ChartWidgetOptions;
  metric: MetricWidgetOptions;
};

/**
 * Helper type to get options for a specific widget type
 */
export type OptionsForWidgetType<T extends keyof WidgetOptionsByType> =
  WidgetOptionsByType[T];

/**
 * Generic widget options type
 */
export type WidgetOptions = WidgetOptionsByType[keyof WidgetOptionsByType];

/**
 * Widget options change handler - type-safe for each widget type
 */
export type WidgetOptionsHandler<
  T extends keyof WidgetOptionsByType = keyof WidgetOptionsByType,
> = (options: Partial<WidgetOptionsByType[T]>) => void;

/**
 * Check if a widget type supports runtime options
 */
export function hasWidgetOptions(
  widgetType: string,
): widgetType is keyof WidgetOptionsByType {
  return ['table'].includes(widgetType); // Only tables for now, easy to extend
}
