import { z } from 'zod';

/** Width of the dashboard grid, in columns. */
export const GRID_COLUMN_COUNT = 12;

const MAX_GRID_ROW = 10_000;

/**
 * Schema for a widget's grid position.
 *
 * Coordinates must be integers within the grid: they are persisted as jsonb and
 * read back through `::int` casts in `cms.get_dashboard()` and the overlap
 * SQL, so a fractional or out-of-range value makes every read of that dashboard
 * raise.
 */
export const WidgetPositionSchema = z.object({
  x: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLUMN_COUNT - 1),
  y: z.number().int().min(0).max(MAX_GRID_ROW),
  w: z.number().int().min(1).max(GRID_COLUMN_COUNT),
  h: z.number().int().min(1).max(MAX_GRID_ROW),
});

export type WidgetPositionType = z.infer<typeof WidgetPositionSchema>;

/**
 * Schema for creating a dashboard
 */
export const CreateDashboardSchema = z.object({
  name: z.string().min(3).max(255), // Matches database constraint
  roleShares: z
    .array(
      z.object({
        roleId: z.uuid(),
        permissionLevel: z.enum(['view', 'edit']).default('view'),
      }),
    )
    .optional(),
});

export type CreateDashboardType = z.infer<typeof CreateDashboardSchema>;

/**
 * Schema for updating a dashboard
 */
export const UpdateDashboardSchema = z.object({
  name: z.string().min(3).max(255),
});

export type UpdateDashboardType = z.infer<typeof UpdateDashboardSchema>;

/**
 * Schema for sharing dashboard with role
 */
export const ShareDashboardSchema = z.object({
  roleId: z.uuid(),
  permissionLevel: z.enum(['view', 'edit']).default('view'),
});

export type ShareDashboardType = z.infer<typeof ShareDashboardSchema>;

/**
 * Schema for applying a widget template to a dashboard
 */
export const ApplyWidgetTemplateSchema = z.object({
  templateId: z.string().min(1, 'Template ID is required'),
  dashboardId: z.uuid('Invalid dashboard ID'),
});

export type ApplyWidgetTemplateType = z.infer<typeof ApplyWidgetTemplateSchema>;

/**
 * Base schema for common widget data configuration fields
 */
const BaseWidgetDataConfigSchema = z.object({
  schemaName: z.string().min(1, 'Schema is required'),
  tableName: z.string().min(1, 'Table is required'),
});

/**
 * Chart widget specific configuration schema
 * All chart-specific fields are required for proper validation
 */
export const ChartWidgetDataConfigSchema = BaseWidgetDataConfigSchema.extend({
  config: z.object({
    // UI configuration
    chartType: z.string().min(1, 'Chart type is required'),
    showLegend: z.boolean().optional(),
    colorScheme: z.string().optional(),
    seriesColors: z.record(z.string(), z.string()).optional(),
    showGrid: z.boolean().optional(),
    // Query configuration
    xAxis: z.string().min(1, 'X-axis column is required'),
    yAxis: z.string().min(1, 'Y-axis column is required'),
    aggregation: z.string().min(1, 'Aggregation method is required'),
    groupBy: z.string().optional(),
    timeAggregation: z
      .enum(['hour', 'day', 'week', 'month', 'quarter', 'year'])
      .optional(),
    dateRange: z
      .object({
        start: z.date(),
        end: z.date(),
      })
      .optional(),
    multiSeries: z
      .object({
        enabled: z.boolean(),
        groupByColumns: z.array(z.string()).optional(),
        seriesType: z.enum(['grouped', 'stacked', 'overlaid']),
        maxSeries: z.number().min(1).max(20),
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
    refreshInterval: z.number().optional(),
  }),
});

/**
 * Metric widget specific configuration schema
 * All metric-specific fields are required for proper validation
 */
export const MetricWidgetDataConfigSchema = BaseWidgetDataConfigSchema.extend({
  config: z.object({
    // UI configuration
    format: z.enum(['number', 'currency', 'percentage', 'decimal']).optional(),
    showTrend: z.boolean().optional(),
    suffix: z.string().optional(),
    prefix: z.string().optional(),
    // Query configuration
    metric: z.string().min(1, 'Metric column is required'),
    aggregation: z.string().min(1, 'Aggregation method is required'),
    groupBy: z.string().optional(),
    filters: z.array(z.any()).optional(),
    refreshInterval: z.number().optional(),
  }),
});

/**
 * Table widget specific configuration schema
 * All table-specific fields are required for proper validation
 */
export const TableWidgetDataConfigSchema = BaseWidgetDataConfigSchema.extend({
  config: z.object({
    // UI configuration
    pageSize: z.number().min(1).max(1000).optional(),
    sortBy: z.string().optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    showSearch: z.boolean().optional(),
    showPagination: z.boolean().optional(),
    sortable: z.boolean().optional(),
    selectable: z.boolean().optional(),
    fixedHeader: z.boolean().optional(),
    // Query configuration
    columns: z.array(z.string()).min(1, 'At least one column is required'),
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
    refreshInterval: z.number().optional(),
  }),
});

export type ChartWidgetDataConfigType = z.infer<
  typeof ChartWidgetDataConfigSchema
>;

export type MetricWidgetDataConfigType = z.infer<
  typeof MetricWidgetDataConfigSchema
>;

export type TableWidgetDataConfigType = z.infer<
  typeof TableWidgetDataConfigSchema
>;
