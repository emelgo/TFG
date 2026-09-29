import type React from 'react';

import {
  dashboardRoleSharesInCms,
  dashboardWidgetsInCms,
  dashboardsInCms,
} from '@pymekit/cms-supabase/schema';

// Import filter types early to avoid reference issues
import type {
  AdvancedFilterCondition,
  AdvancedQueryConfig,
  FilterItem,
  FilterOperator,
  LogicalOperator,
  RelativeDateOption,
  SortDirection,
  SortState,
} from '../lib/filters/types';

// Dashboard types
export type Dashboard = typeof dashboardsInCms.$inferSelect;
export type NewDashboard = typeof dashboardsInCms.$inferInsert;

export type DashboardWithStats = Dashboard & {
  widgetCount: number;
  isOwner?: boolean;
  permissionLevel?: 'owner' | 'view' | 'edit';
};

// Dashboard sharing types
export type DashboardShare = typeof dashboardRoleSharesInCms.$inferSelect;

export type NewDashboardShare = typeof dashboardRoleSharesInCms.$inferInsert;

export type DashboardPermissionLevel = 'view' | 'edit';

// Dashboard API response types
export type DashboardWithDetails = {
  dashboard: Dashboard;
  widgets: DashboardWidget[];
  canEdit: boolean;
};

export type DashboardListResponse = {
  dashboards: DashboardWithStats[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

// Widget types
export type DashboardWidget = {
  id: string;
  dashboard_id: string;
  widget_type: string;
  title: string;
  schema_name: string;
  table_name: string;
  config: object;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  created_at: string;
  updated_at: string;
};

export type NewDashboardWidget = typeof dashboardWidgetsInCms.$inferInsert;

// Widget configuration types
export type BaseWidgetConfig = {
  title?: string;
  description?: string;
  refreshInterval?: number; // seconds
};

export type ChartAggregation = 'sum' | 'count' | 'avg' | 'min' | 'max';
export type ChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'area'
  | 'scatter'
  | 'doughnut';

export type ChartWidgetConfig = BaseWidgetConfig & {
  // UI configuration
  chartType?: ChartType;
  colors?: string[];
  seriesColors?: Record<string, string>; // Series name -> color mapping for multi-series
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
  tension?: number;
  opacity?: number;
  xAxis?: string;
  yAxis?: string;
  yAxisFormatterType?: string; // Y-axis formatter
  yAxisFormatterConfig?: Record<string, unknown>;
  xAxisFormatterType?: string; // X-axis formatter (for dates, etc.)
  xAxisFormatterConfig?: Record<string, unknown>;
  tooltipFormatterType?: string; // Tooltip value formatter
  tooltipFormatterConfig?: Record<string, unknown>;
  groupBy?: string;
  aggregation?: ChartAggregation;
  timeAggregation?: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  dateRange?: {
    start: Date;
    end: Date;
  };
  multiSeries?: {
    enabled: boolean;
    groupByColumns?: string[];
    seriesType: 'grouped' | 'stacked' | 'overlaid';
    maxSeries: number;
  };
  filters?: unknown[];
  orderBy?: {
    column: string;
    direction: 'asc' | 'desc';
  }[];
  limit?: number;
  offset?: number;
};

export type MetricFormat = 'number' | 'currency' | 'percentage' | 'decimal';
export type MetricAggregation = 'sum' | 'count' | 'avg' | 'min' | 'max';

export type MetricWidgetConfig = BaseWidgetConfig & {
  // UI configuration
  format?: MetricFormat;
  formatterType?: string; // Custom formatter name from registry
  formatterConfig?: Record<string, unknown>; // Custom formatter configuration
  prefix?: string;
  suffix?: string;
  showTrend?: boolean;
  trendDirection?: 'positive' | 'negative'; // Whether increasing values are good (positive) or bad (negative)
  showProgress?: boolean;
  precision?: number;
  icon?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  metric?: string;
  aggregation?: MetricAggregation;
  filters?: unknown[];
};

export type ColumnWidth = 'auto' | 'equal' | 'fit' | 'fixed';

export type TableWidgetConfig = BaseWidgetConfig & {
  // UI configuration
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  showSearch?: boolean;
  showPagination?: boolean;
  columnWidth?: ColumnWidth;
  zebra?: boolean;
  compact?: boolean;
  wrapText?: boolean;
  fixedHeader?: boolean;
  sortable?: boolean;
  searchable?: boolean;
  exportable?: boolean;
  selectable?: boolean;
  actions?: boolean;
  columns?: string[];
  columnFormatters?: Record<
    string,
    {
      // Column name -> formatter config
      formatterType: string;
      formatterConfig?: Record<string, unknown>;
    }
  >;
  filters?: unknown[];
  orderBy?: {
    column: string;
    direction: 'asc' | 'desc';
  }[];
  limit?: number;
  offset?: number;
};

export type WidgetConfig =
  | ChartWidgetConfig
  | MetricWidgetConfig
  | TableWidgetConfig;

// Specific configuration value types for type-safe access
export type ChartConfigValue = ChartWidgetConfig[keyof ChartWidgetConfig];
export type MetricConfigValue = MetricWidgetConfig[keyof MetricWidgetConfig];
export type TableConfigValue = TableWidgetConfig[keyof TableWidgetConfig];

// Generic widget config base type for components
export type WidgetConfigBase<T extends WidgetConfig = WidgetConfig> = T;

export type { WidgetFormData } from './widget-forms';

// Re-export advanced filter types
export type {
  FilterOperator,
  LogicalOperator,
  AdvancedFilterCondition,
  AdvancedQueryConfig,
  RelativeDateOption,
  FilterItem,
  SortDirection,
  SortState,
};

// More specific query config type
export type QueryConfigWithFilters = {
  filters?: AdvancedFilterCondition[];
  columns?: string[];
  groupBy?: string[];
  orderBy?: {
    column: string;
    direction: 'asc' | 'desc';
  }[];
  limit?: number;
  offset?: number;
};

// Re-export FilterValue from lib/filters/types but also define our own for form handling
export type { FilterValue as LibFilterValue } from '../lib/filters/types';

// Legacy types for backward compatibility
export interface FilterCondition {
  column: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'like'
    | 'in'
    | 'not_in';
  value: unknown;
}

export interface QueryConfig {
  columns?: string[];
  filters?: FilterCondition[] | AdvancedFilterCondition[];
  groupBy?: string[];
  orderBy?: {
    column: string;
    direction: 'asc' | 'desc';
  }[];
  limit?: number;
  offset?: number;
}

// Layout types (for react-grid-layout)
export interface LayoutItem {
  i: string; // widget id
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}

export type Layout = LayoutItem[];

// Widget data types
export interface WidgetData {
  data: unknown[];
  metadata?: {
    totalCount?: number;
    lastUpdated?: string;
    [key: string]: unknown;
  };
}

export interface ChartData {
  data: Array<{
    [key: string]: unknown;
  }>;
  categories?: string[];
}

export type ChartTrend = 'up' | 'down' | 'stable';

export interface MetricData {
  value: number;
  previousValue?: number;
  trend?: ChartTrend;
  trendPercentage?: number;
}

export interface TableData {
  rows: Array<{
    [key: string]: unknown;
  }>;
  totalCount: number;
  pageCount: number;
}

// API Response types
export interface DashboardsResponse {
  dashboards: DashboardWithStats[];
  total: number;
}

export interface DashboardResponse {
  dashboard: Dashboard;
  widgets: DashboardWidget[];
}

export interface WidgetDataResponse {
  data: WidgetData;
  metadata?: {
    totalCount?: number;
    lastUpdated?: string;
    [key: string]: unknown;
  };
}

// Widget registry types
export type WidgetComponentProps = {
  widget: DashboardWidget;
  data?: WidgetData;
  config?: WidgetConfig;
  isEditing?: boolean;
  className?: string;
  onConfigChange?: (config: Partial<WidgetConfig>) => void;
};

export type WidgetConfigComponentProps = {
  config: WidgetConfig;
  onChange: (config: Partial<WidgetConfig>) => void;
  schema: string;
  table: string;
};

export type WidgetType = 'chart' | 'metric' | 'table';

export type WidgetObject = {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  bgColor?: string;
  color?: string;
  defaultConfig: Partial<WidgetConfig>;
  defaultSize: {
    w: number;
    h: number;
  };
  minSize: {
    w: number;
    h: number;
  };
  component: React.ComponentType<WidgetComponentProps>;
  configComponent: React.ComponentType<WidgetConfigComponentProps>;
};

// Component prop types for eliminating any usage
export type WidgetConfigUpdateHandler = (
  updates: Partial<WidgetConfig>,
) => void;

export type WidgetDataUpdateHandler = (data: WidgetData) => void;
export type LayoutChangeHandler = (layout: Layout) => void;

// Service types
export type WidgetUpdateData = {
  id: string;
  config?: Partial<WidgetConfig>;
  position?: Partial<LayoutItem>;
};

export type DashboardUpdateData = {
  id: string;
  name?: string;
  description?: string;
  layout?: Layout;
};

export type CreateWidgetForm = {
  widgetType: WidgetType;
  title: string;
  schemaName: string;
  tableName: string;
  config: WidgetConfig;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

// External data types (using unknown for truly unknown data)
export type ExternalApiResponse = {
  data: unknown;
  metadata?: Record<string, unknown>;
  status: 'success' | 'error';
  message?: string;
};

// Form-related types for react-hook-form
export type FormFieldValue =
  | string
  | number
  | boolean
  | string[]
  | null
  | undefined;

export type FormData = Record<string, FormFieldValue>;

// Widget form submission data
export type WidgetSubmissionData = {
  title: string;
  schemaName: string;
  tableName: string;
  config: WidgetConfig;
  widgetType: WidgetObject;
  id?: string; // For updates
};

// Form data with specific fields for widget configuration
export type WidgetFormFields = {
  title: string;
  schemaName: string;
  tableName: string;
  config: WidgetConfig;
};

// Widget options system
export * from './widget-options';

// Widget templates system
export * from './widget-templates';
