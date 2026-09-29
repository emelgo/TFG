import type { ComponentType } from 'react';

import { BarChart3Icon, TableIcon, TrendingUpIcon } from 'lucide-react';

import type { WidgetComponentProps, WidgetType } from '../types';

// Config field value types
type ConfigFieldValue = string | number | boolean | string[] | null;

// Config field option type
type ConfigFieldOption = {
  label: string;
  value: ConfigFieldValue;
  labelKey?: string; // Optional i18n key for internationalization
};

/**
 * Widget type configuration interface
 */
export interface WidgetTypeConfig {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  component: ComponentType<WidgetComponentProps> | null;
  defaultSize: {
    w: number;
    h: number;
  };
  minSize: {
    w: number;
    h: number;
  };
  maxSize?: {
    w: number;
    h: number;
  };
  configFields: WidgetConfigField[];
  queryConfigFields: QueryConfigField[];
}

/**
 * Widget configuration field types
 */
export interface WidgetConfigField {
  key: string;
  label: string;
  type:
    | 'text'
    | 'select'
    | 'boolean'
    | 'number'
    | 'color'
    | 'date'
    | 'multiselect';
  required?: boolean;
  defaultValue?: ConfigFieldValue;
  options?: ConfigFieldOption[];
  description?: string;
  category?: 'appearance' | 'behavior' | 'data';
  dependsOn?: string; // Field is only shown if this field has a truthy value
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

/**
 * Query configuration field types
 */
export interface QueryConfigField {
  key: string;
  label: string;
  type:
    | 'column'
    | 'filter'
    | 'sort'
    | 'limit'
    | 'aggregation'
    | 'groupBy'
    | 'dateRange'
    | 'multiColumn';
  required?: boolean;
  defaultValue?: ConfigFieldValue;
  description?: string;
  allowMultiple?: boolean; // For multi-column selection
  dataTypes?: string[]; // Restrict to specific column data types
  category?: 'data' | 'filtering' | 'aggregation' | 'display';
}

/**
 * Chart widget configuration
 */
export const chartWidgetConfig: WidgetTypeConfig = {
  id: 'chart',
  name: 'Chart',
  description: 'Display data in various chart formats (bar, line, pie)',
  icon: BarChart3Icon,
  component: null, // Will be lazy loaded
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 8 },
  configFields: [
    {
      key: 'chartType',
      label: 'Chart Type',
      type: 'select',
      required: true,
      defaultValue: 'bar',
      category: 'appearance',
      options: [
        { label: 'Bar Chart', value: 'bar' },
        { label: 'Line Chart', value: 'line' },
        { label: 'Area Chart', value: 'area' },
        { label: 'Pie Chart', value: 'pie' },
      ],
      description: 'The type of chart to display',
    },
    {
      key: 'title',
      label: 'Chart Title',
      type: 'text',
      category: 'appearance',
      defaultValue: '',
      description: 'Optional title for the chart',
    },
    {
      key: 'xAxisLabel',
      label: 'X-Axis Label',
      type: 'text',
      category: 'appearance',
      defaultValue: '',
      description: 'Label for the X-axis',
    },
    {
      key: 'yAxisLabel',
      label: 'Y-Axis Label',
      type: 'text',
      category: 'appearance',
      defaultValue: '',
      description: 'Label for the Y-axis',
    },
    {
      key: 'showLegend',
      label: 'Show Legend',
      type: 'boolean',
      category: 'appearance',
      defaultValue: true,
      description: 'Display chart legend',
    },
    {
      key: 'showGridLines',
      label: 'Show Grid Lines',
      type: 'boolean',
      category: 'appearance',
      defaultValue: true,
      description: 'Display grid lines on the chart',
    },
    {
      key: 'showDataLabels',
      label: 'Show Data Labels',
      type: 'boolean',
      category: 'appearance',
      defaultValue: false,
      description: 'Display values on data points',
    },
    {
      key: 'colorScheme',
      label: 'Color Scheme',
      type: 'select',
      category: 'appearance',
      defaultValue: 'default',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Blue', value: 'blue' },
        { label: 'Green', value: 'green' },
        { label: 'Red', value: 'red' },
        { label: 'Purple', value: 'purple' },
      ],
      description: 'Color palette for the chart',
    },
    {
      key: 'stackedBars',
      label: 'Stacked Bars',
      type: 'boolean',
      category: 'behavior',
      defaultValue: false,
      dependsOn: 'chartType',
      description: 'Stack bars on top of each other',
    },
    {
      key: 'curveType',
      label: 'Curve Type',
      type: 'select',
      category: 'appearance',
      defaultValue: 'monotone',
      dependsOn: 'chartType',
      options: [
        { label: 'Linear', value: 'linear' },
        { label: 'Smooth', value: 'monotone' },
        { label: 'Step', value: 'step' },
      ],
      description: 'Line curve interpolation',
    },
    {
      key: 'enableZoom',
      label: 'Enable Zoom',
      type: 'boolean',
      category: 'behavior',
      defaultValue: false,
      description: 'Allow users to zoom into the chart',
    },
    {
      key: 'enableAnimation',
      label: 'Enable Animation',
      type: 'boolean',
      category: 'behavior',
      defaultValue: true,
      description: 'Animate chart transitions',
    },
  ],
  queryConfigFields: [
    {
      key: 'xAxis',
      label: 'X-Axis Column',
      type: 'column',
      category: 'data',
      required: true,
      description: 'Column to use for X-axis values',
    },
    {
      key: 'yAxis',
      label: 'Y-Axis Column',
      type: 'column',
      category: 'data',
      required: true,
      dataTypes: ['number', 'integer', 'decimal'],
      description: 'Numeric column to use for Y-axis values',
    },
    {
      key: 'groupBy',
      label: 'Group By',
      type: 'column',
      category: 'aggregation',
      description: 'Optional column to group data by',
    },
    {
      key: 'seriesColumn',
      label: 'Series Column',
      type: 'column',
      category: 'data',
      description: 'Column to create multiple data series',
    },
    {
      key: 'aggregation',
      label: 'Aggregation',
      type: 'aggregation',
      category: 'aggregation',
      defaultValue: 'sum',
      description: 'How to aggregate grouped data',
    },
    {
      key: 'dateRange',
      label: 'Date Range',
      type: 'dateRange',
      category: 'filtering',
      description: 'Filter data by date range',
    },
    {
      key: 'filters',
      label: 'Filters',
      type: 'filter',
      category: 'filtering',
      description: 'Conditions to filter the data',
    },
    {
      key: 'sort',
      label: 'Sort Order',
      type: 'sort',
      category: 'display',
      description: 'How to sort the data',
    },
    {
      key: 'limit',
      label: 'Limit',
      type: 'limit',
      category: 'display',
      defaultValue: 100,
      description: 'Maximum number of records to display',
    },
  ],
};

/**
 * Metric widget configuration
 */
export const metricWidgetConfig: WidgetTypeConfig = {
  id: 'metric',
  name: 'Metric',
  description: 'Display a single key metric with optional trend indicator',
  icon: TrendingUpIcon,
  component: null, // Will be lazy loaded
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 3 },
  configFields: [
    {
      key: 'title',
      label: 'Metric Title',
      type: 'text',
      category: 'appearance',
      required: true,
      defaultValue: 'Metric',
      description: 'Title for the metric display',
    },
    {
      key: 'format',
      label: 'Number Format',
      type: 'select',
      category: 'appearance',
      defaultValue: 'number',
      options: [
        { label: 'Number', value: 'number' },
        { label: 'Currency', value: 'currency' },
        { label: 'Percentage', value: 'percentage' },
        { label: 'Decimal', value: 'decimal' },
      ],
      description: 'How to format the metric value',
    },
    {
      key: 'suffix',
      label: 'Suffix',
      type: 'text',
      category: 'appearance',
      defaultValue: '',
      description: 'Text to append after the value',
    },
    {
      key: 'showProgress',
      label: 'Show Progress Bar',
      type: 'boolean',
      category: 'appearance',
      defaultValue: false,
      description: 'Display progress bar toward target',
    },
    {
      key: 'showTrend',
      label: 'Show Trend',
      type: 'boolean',
      category: 'behavior',
      defaultValue: false,
      description: 'Display trend indicator',
    },
    {
      key: 'comparisonPeriod',
      label: 'Comparison Period',
      type: 'select',
      category: 'behavior',
      defaultValue: 'none',
      dependsOn: 'showTrend',
      options: [
        { label: 'No Comparison', value: 'none' },
        { label: 'Previous Period', value: 'previous_period' },
        { label: 'vs Last Week', value: 'last_week' },
        { label: 'vs Last Month', value: 'last_month' },
        { label: 'vs Last Year', value: 'last_year' },
      ],
      description: 'Period for trend comparison',
    },
    {
      key: 'targetValue',
      label: 'Target Value',
      type: 'number',
      category: 'data',
      description: 'Target goal for this metric',
    },
    {
      key: 'lowThreshold',
      label: 'Low Threshold',
      type: 'number',
      category: 'appearance',
      description: 'Value below which metric shows as low',
    },
    {
      key: 'highThreshold',
      label: 'High Threshold',
      type: 'number',
      category: 'appearance',
      description: 'Value above which metric shows as high',
    },
    {
      key: 'lowColor',
      label: 'Low Color',
      type: 'color',
      category: 'appearance',
      defaultValue: '#ef4444',
      description: 'Color for low values',
    },
    {
      key: 'normalColor',
      label: 'Normal Color',
      type: 'color',
      category: 'appearance',
      defaultValue: '#3b82f6',
      description: 'Color for normal values',
    },
    {
      key: 'highColor',
      label: 'High Color',
      type: 'color',
      category: 'appearance',
      defaultValue: '#22c55e',
      description: 'Color for high values',
    },
  ],
  queryConfigFields: [
    {
      key: 'metric',
      label: 'Metric Column',
      type: 'column',
      category: 'data',
      required: true,
      dataTypes: ['number', 'integer', 'decimal'],
      description: 'Numeric column to calculate the metric from',
    },
    {
      key: 'aggregation',
      label: 'Aggregation',
      type: 'aggregation',
      category: 'aggregation',
      defaultValue: 'count',
      description: 'How to aggregate the metric',
    },
    {
      key: 'dateRange',
      label: 'Date Range',
      type: 'dateRange',
      category: 'filtering',
      description: 'Filter data by date range',
    },
    {
      key: 'filters',
      label: 'Filters',
      type: 'filter',
      category: 'filtering',
      description: 'Conditions to filter the data',
    },
  ],
};

/**
 * Table widget configuration
 */
export const tableWidgetConfig: WidgetTypeConfig = {
  id: 'table',
  name: 'Table',
  description: 'Display data in a tabular format with sorting and filtering',
  icon: TableIcon,
  component: null, // Will be lazy loaded
  defaultSize: { w: 8, h: 5 },
  minSize: { w: 4, h: 3 },
  maxSize: { w: 12, h: 10 },
  configFields: [
    {
      key: 'title',
      label: 'Table Title',
      type: 'text',
      defaultValue: '',
      description: 'Optional title for the table',
    },
    {
      key: 'showPagination',
      label: 'Show Pagination',
      type: 'boolean',
      defaultValue: true,
      description: 'Enable pagination for large datasets',
    },
    {
      key: 'pageSize',
      label: 'Page Size',
      type: 'number',
      defaultValue: 10,
      description: 'Number of rows per page',
    },
    {
      key: 'showSearch',
      label: 'Show Search',
      type: 'boolean',
      defaultValue: true,
      description: 'Enable search functionality',
    },
  ],
  queryConfigFields: [
    {
      key: 'columns',
      label: 'Columns',
      type: 'column',
      required: true,
      description: 'Columns to display in the table',
    },
    {
      key: 'filters',
      label: 'Filters',
      type: 'filter',
      description: 'Conditions to filter the data',
    },
    {
      key: 'sort',
      label: 'Sort By',
      type: 'sort',
      description: 'Default sorting configuration',
    },
    {
      key: 'limit',
      label: 'Limit',
      type: 'limit',
      defaultValue: 100,
      description: 'Maximum number of records to display',
    },
  ],
};

/**
 * Widget registry containing all available widget types
 */
export const widgetRegistry: Record<WidgetType, WidgetTypeConfig> = {
  chart: chartWidgetConfig,
  metric: metricWidgetConfig,
  table: tableWidgetConfig,
};

/**
 * Get all available widget types
 */
export function getAvailableWidgetTypes(): WidgetTypeConfig[] {
  return Object.values(widgetRegistry);
}

/**
 * Get widget type configuration by ID
 */
export function getWidgetTypeConfig(widgetType: WidgetType) {
  return widgetRegistry[widgetType];
}

/**
 * Check if a widget type exists
 */
export function isValidWidgetType(widgetTypeId: string): boolean {
  return widgetTypeId in widgetRegistry;
}

/**
 * Get default configuration for a widget type
 */
export function getDefaultWidgetConfig(
  widgetTypeId: string,
): Record<string, ConfigFieldValue> {
  const widgetType = getWidgetTypeConfig(widgetTypeId as WidgetType);
  if (!widgetType) return {};

  const config: Record<string, ConfigFieldValue> = {};
  widgetType.configFields.forEach((field) => {
    if (field.defaultValue !== undefined) {
      config[field.key] = field.defaultValue;
    }
  });

  return config;
}

/**
 * Get default query configuration for a widget type
 */
export function getDefaultQueryConfig(
  widgetTypeId: string,
): Record<string, ConfigFieldValue> {
  const widgetType = getWidgetTypeConfig(widgetTypeId as WidgetType);
  if (!widgetType) return {};

  const queryConfig: Record<string, ConfigFieldValue> = {};
  widgetType.queryConfigFields.forEach((field) => {
    if (field.defaultValue !== undefined) {
      queryConfig[field.key] = field.defaultValue;
    }
  });

  return queryConfig;
}
