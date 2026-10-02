import { z } from 'zod';

import type { WidgetType } from '.';

/**
 * Base widget form schema (fields that all widgets have)
 */
export const BaseWidgetFormSchema = z.object({
  title: z.preprocess(
    (val) => (val === '' ? null : String(val).trim()),
    z.string().min(1, 'Title is required'),
  ),
  description: z.preprocess(
    (val) => (val === '' ? null : String(val).trim()),
    z.string().nullish(),
  ),
  schemaName: z.string().min(1, 'Schema name is required'),
  tableName: z.string().min(1, 'Table name is required'),
  type: z.enum(['chart', 'metric', 'table']),
});

/**
 * Chart widget unified configuration (includes query config)
 */
export const ChartWidgetConfigSchema = z.object({
  // UI configuration
  chartType: z.enum(['bar', 'line', 'area']),
  showLegend: z.boolean().optional(),
  colorScheme: z.string().optional(),
  // Multi-series color configuration
  seriesColors: z.record(z.string(), z.string()).optional(), // Series name -> color mapping
  showGrid: z.boolean().optional(),
  xAxis: z.preprocess(
    (val) => (!val || val === 'undefined' ? '' : String(val).trim()),
    z.string().min(1, 'X-axis is required'),
  ),
  yAxis: z.preprocess(
    (val) => (!val || val === 'undefined' ? '' : String(val).trim()),
    z.string().min(1, 'Y-axis is required'),
  ),
  // Formatter configuration for chart axes
  yAxisFormatterType: z.string().optional(),
  yAxisFormatterConfig: z.record(z.string(), z.unknown()).optional(),
  xAxisFormatterType: z.string().optional(),
  xAxisFormatterConfig: z.record(z.string(), z.unknown()).optional(),
  tooltipFormatterType: z.string().optional(),
  tooltipFormatterConfig: z.record(z.string(), z.unknown()).optional(),
  groupBy: z.string().optional(),
  aggregation: z.enum(['sum', 'count', 'avg', 'min', 'max']).optional(),
  // Time series support for datetime x-axis
  timeAggregation: z
    .enum(['hour', 'day', 'week', 'month', 'quarter', 'year'])
    .optional(),
  dateRange: z
    .object({
      start: z.date(),
      end: z.date(),
    })
    .optional(),
  // Multi-series support for comparative analysis
  multiSeries: z
    .object({
      enabled: z.boolean().default(false),
      groupByColumns: z.array(z.string()).optional(), // Multiple grouping dimensions
      seriesType: z.enum(['grouped', 'stacked', 'overlaid']).default('grouped'),
      maxSeries: z.number().min(1).max(20).default(10), // Limit number of series for performance
    })
    .optional(),
  filters: z.array(z.any()).optional(),
  orderBy: z
    .array(
      z.object({
        column: z.string(),
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const ChartWidgetFormSchema = BaseWidgetFormSchema.extend({
  config: ChartWidgetConfigSchema.strict(),
});

/**
 * Metric widget unified configuration (includes query config)
 */
export const MetricWidgetConfigSchema = z
  .object({
    // UI configuration
    title: z.string().optional(),
    format: z.enum(['number', 'currency', 'percentage', 'decimal']).optional(),
    // Custom formatter configuration (new approach)
    formatterType: z.string().optional(),
    formatterConfig: z.record(z.string(), z.unknown()).optional(),
    showTrend: z.boolean().optional(),
    trendDirection: z.enum(['positive', 'negative']).optional(),
    suffix: z.string().optional(),
    prefix: z.string().optional(),
    precision: z.number().optional(),
    metric: z.string().optional(),
    aggregation: z.enum(['sum', 'count', 'avg', 'min', 'max']).optional(),
    filters: z.array(z.any()).optional(),
  })
  .refine(
    (data) => {
      if (data.aggregation !== 'count') {
        return (
          data.metric && data.metric.trim() !== '' && data.metric.trim() !== '*'
        );
      }

      return true;
    },
    {
      message: 'dashboard:validation.columnRequired',
      path: ['metric'],
    },
  );

export const MetricWidgetFormSchema = BaseWidgetFormSchema.extend({
  config: MetricWidgetConfigSchema,
});

/**
 * Table widget unified configuration (includes query config)
 */
export const TableWidgetConfigSchema = z.object({
  // UI configuration
  title: z.string().optional(),
  showPagination: z.boolean().optional(),
  pageSize: z.number().optional(),
  showSearch: z.boolean().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  refreshInterval: z.number().optional(),
  columns: z.array(z.string()).optional(),
  // Per-column formatter configuration
  columnFormatters: z
    .record(
      z.string(),
      z.object({
        formatterType: z.string(),
        formatterConfig: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  // Table-level configuration
  selectable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  fixedHeader: z.boolean().optional(),
  filters: z.array(z.any()).optional(),
  orderBy: z
    .array(
      z.object({
        column: z.string(),
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const TableWidgetFormSchema = BaseWidgetFormSchema.extend({
  config: TableWidgetConfigSchema.strict(),
});

/**
 * Generic config type that allows all possible widget configs
 */
export const AnyWidgetConfigSchema = z
  .union([
    ChartWidgetConfigSchema,
    MetricWidgetConfigSchema,
    TableWidgetConfigSchema,
  ])
  .optional();

/**
 * Flexible form schema for wizard steps - allows any config type during form building
 * Uses superRefine() to validate config based on the selected widget type
 */
export const FlexibleWidgetFormSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().nullish(),
    schemaName: z.string().min(1, 'Schema name is required'),
    tableName: z.string().min(1, 'Table name is required'),
    type: z.enum(['chart', 'metric', 'table']),
    config: AnyWidgetConfigSchema,
  })
  .superRefine((data, ctx) => {
    // Validate config based on widget type
    if (data.config) {
      let configResult;

      switch (data.type) {
        case 'chart':
          configResult = ChartWidgetConfigSchema.strict().safeParse(
            data.config,
          );
          break;

        case 'metric':
          configResult = MetricWidgetConfigSchema.safeParse(data.config);

          break;

        case 'table':
          configResult = TableWidgetConfigSchema.strict().safeParse(
            data.config,
          );
          break;
        default:
          return;
      }

      if (!configResult.success) {
        configResult.error.issues.forEach((error) => {
          ctx.addIssue({
            code: 'custom',
            message: error.message,
            path: ['config', ...error.path],
          });
        });
      }

      // Note: Date filter validation for trend comparison is handled in the TrendDateFilter component
      // where we have access to column metadata to properly identify date columns
    }
  });

export const AllWidgetsSchema = z.union([
  ChartWidgetFormSchema,
  MetricWidgetFormSchema,
  TableWidgetFormSchema,
]);

/**
 * Union type for all widget form schemas
 */
export type WidgetFormData = z.infer<typeof AllWidgetsSchema>;

/**
 * Type-safe function to get the correct schema for a widget type
 */
export function getWidgetFormSchema(widgetType: string) {
  switch (widgetType) {
    case 'chart':
      return ChartWidgetFormSchema;

    case 'metric':
      return MetricWidgetFormSchema;

    case 'table':
      return TableWidgetFormSchema;

    default:
      return BaseWidgetFormSchema;
  }
}

/**
 * Dynamic schema that validates based on the selected widget type
 * This ensures proper validation for config fields
 */
export function createDynamicWidgetFormSchema(widgetType?: string) {
  return z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().nullable().optional(),
    schemaName: z.string().min(1, 'Schema name is required'),
    tableName: z.string().min(1, 'Table name is required'),
    type: z.enum(['chart', 'metric', 'table']),
    config: widgetType
      ? getWidgetConfigSchema(widgetType)
      : AnyWidgetConfigSchema,
  });
}

/**
 * Get the specific config schema for a widget type
 */
export function getWidgetConfigSchema(widgetType: string) {
  switch (widgetType) {
    case 'chart':
      return ChartWidgetConfigSchema;
    case 'metric':
      return MetricWidgetConfigSchema;
    case 'table':
      return TableWidgetConfigSchema;
    default:
      return AnyWidgetConfigSchema;
  }
}

/**
 * Individual type exports
 */
export type ChartWidgetFormData = z.infer<typeof ChartWidgetFormSchema>;
export type MetricWidgetFormData = z.infer<typeof MetricWidgetFormSchema>;
export type TableWidgetFormData = z.infer<typeof TableWidgetFormSchema>;
export type BaseWidgetFormData = z.infer<typeof BaseWidgetFormSchema>;
export type FlexibleWidgetFormData = z.infer<typeof FlexibleWidgetFormSchema>;

/**
 * Partial form data for wizard steps - represents incomplete form state
 * All fields are optional to handle progressive form building
 */
export type PartialWidgetFormData = {
  title?: string;
  description?: string | null;
  type?: WidgetType;
  schemaName?: string;
  tableName?: string;
  config?:
    | z.infer<typeof ChartWidgetConfigSchema>
    | z.infer<typeof MetricWidgetConfigSchema>
    | z.infer<typeof TableWidgetConfigSchema>
    | undefined;
};

/**
 * Widget form step update data - for updating specific fields
 */
export type WidgetFormStepUpdate = Partial<PartialWidgetFormData>;
