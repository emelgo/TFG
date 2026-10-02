import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

import type {
  FilterItem,
  FilterValue,
  RelativeDateOption,
} from './filter-item.types';

// Re-export for backward compatibility - but prefer importing from ./filter-item.types
export type { FilterItem, FilterValue, RelativeDateOption };

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort state
 */
export type SortState = {
  column: string | null;
  direction: SortDirection | null;
};

/**
 * All supported filter operators (extended from data-explorer)
 */
export type FilterOperator =
  | 'eq' // equals
  | 'neq' // not equals
  | 'lt' // less than
  | 'lte' // less than or equal
  | 'gt' // greater than
  | 'gte' // greater than or equal
  | 'contains' // text contains
  | 'startsWith' // text starts with
  | 'endsWith' // text ends with
  | 'in' // in array
  | 'notIn' // not in array
  | 'isNull' // is null
  | 'notNull' // is not null
  | 'between' // between values
  | 'notBetween' // not between values
  | 'before' // date before
  | 'beforeOrOn' // date before or on
  | 'after' // date after
  | 'afterOrOn' // date after or on
  | 'during' // date during
  | 'containsText' // JSON contains text
  | 'hasKey' // JSON has key
  | 'keyEquals' // JSON key equals
  | 'pathExists'; // JSON path exists

/**
 * Logical operators for combining filters
 */
export type LogicalOperator = 'AND' | 'OR';

/**
 * Enhanced filter condition with logical operators
 */
export interface AdvancedFilterCondition<Config = Record<string, unknown>> {
  column: string;
  operator: FilterOperator;
  value: unknown;
  logicalOperator?: LogicalOperator;
  config?: Config;
}

/**
 * Enhanced query configuration for dashboard widgets
 */
export interface AdvancedQueryConfig {
  columns?: string[];
  filters?: AdvancedFilterCondition[];
  groupBy?: string[];
  orderBy?: {
    column: string;
    direction: SortDirection;
  }[];
  limit?: number;
  offset?: number;
  // New advanced features
  having?: AdvancedFilterCondition[]; // Post-aggregation filters
  distinct?: boolean;
  joins?: {
    table: string;
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
    on: string;
  }[];
  // Time series support
  timeAggregation?: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  dateRange?: {
    start: Date;
    end: Date;
  };
  // Multi-series support
  multiSeries?: {
    enabled: boolean;
    groupByColumns?: string[];
    seriesType: 'grouped' | 'stacked' | 'overlaid';
    maxSeries: number;
  };
}

/**
 * Widget filter configuration props
 * Uses the standard FilterItem[] shape instead of a custom format
 */
export interface WidgetFilterContainerProps {
  columns: ColumnMetadata[];
  currentFilters: FilterItem[];
  onFiltersChange: (filters: FilterItem[]) => void;
  className?: string;
  schemaName: string;
  tableName: string;
  relations?: RelationConfig[];
}

/**
 * Operator mapping for different data types
 */
export const OPERATOR_MAP: Record<string, FilterOperator[]> = {
  // Text types
  text: [
    'eq',
    'neq',
    'contains',
    'startsWith',
    'endsWith',
    'in',
    'notIn',
    'isNull',
    'notNull',
  ],
  'character varying': [
    'eq',
    'neq',
    'contains',
    'startsWith',
    'endsWith',
    'in',
    'notIn',
    'isNull',
    'notNull',
  ],

  // Numeric types
  integer: [
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'between',
    'notBetween',
    'in',
    'notIn',
    'isNull',
    'notNull',
  ],
  bigint: [
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'between',
    'notBetween',
    'in',
    'notIn',
    'isNull',
    'notNull',
  ],
  smallint: [
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'between',
    'notBetween',
    'in',
    'notIn',
    'isNull',
    'notNull',
  ],
  numeric: [
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'between',
    'notBetween',
    'in',
    'notIn',
    'isNull',
    'notNull',
  ],
  real: [
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'between',
    'notBetween',
    'in',
    'notIn',
    'isNull',
    'notNull',
  ],
  'double precision': [
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'between',
    'notBetween',
    'in',
    'notIn',
    'isNull',
    'notNull',
  ],

  // Boolean
  boolean: ['eq', 'isNull', 'notNull'],

  // Date/time
  date: [
    'eq',
    'neq',
    'before',
    'beforeOrOn',
    'after',
    'afterOrOn',
    'during',
    'between',
    'notBetween',
    'isNull',
    'notNull',
  ],
  timestamp: [
    'eq',
    'neq',
    'before',
    'beforeOrOn',
    'after',
    'afterOrOn',
    'during',
    'between',
    'notBetween',
    'isNull',
    'notNull',
  ],
  'timestamp with time zone': [
    'eq',
    'neq',
    'before',
    'beforeOrOn',
    'after',
    'afterOrOn',
    'during',
    'between',
    'notBetween',
    'isNull',
    'notNull',
  ],

  // UUID
  uuid: ['eq', 'neq', 'in', 'notIn', 'isNull', 'notNull'],

  // Enum
  enum: ['eq', 'neq', 'in', 'notIn', 'isNull', 'notNull'],

  // JSON
  json: [
    'containsText',
    'hasKey',
    'keyEquals',
    'pathExists',
    'isNull',
    'notNull',
  ],
  jsonb: [
    'containsText',
    'hasKey',
    'keyEquals',
    'pathExists',
    'isNull',
    'notNull',
  ],

  // Fallback
  default: ['eq', 'neq', 'isNull', 'notNull'],
};

/**
 * Get operators for a specific data type
 */
export function getOperatorsForDataType(dataType: string): FilterOperator[] {
  const operators = OPERATOR_MAP[dataType] || OPERATOR_MAP['default'];
  return operators || ['eq', 'neq', 'isNull', 'notNull'];
}

/**
 * Check if operator needs date range (between, during)
 */
export function isRangeOperator(operator: string): boolean {
  return ['between', 'notBetween', 'during'].includes(operator);
}

/**
 * Map date operators to SQL equivalents
 */
export function mapDateOperator(operator: FilterOperator): FilterOperator {
  switch (operator) {
    case 'before':
      return 'lt';
    case 'beforeOrOn':
      return 'lte';
    case 'after':
      return 'gt';
    case 'afterOrOn':
      return 'gte';
    case 'during':
      return 'eq';
    default:
      return operator;
  }
}

/**
 * Check if a value represents a relative date
 */
export function isRelativeDate(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('__rel_date:');
}

/**
 * Extract relative date option from value
 */
export function extractRelativeDateOption(
  value: string,
): RelativeDateOption | null {
  if (!isRelativeDate(value)) {
    return null;
  }
  const option = value.replace('__rel_date:', '') as RelativeDateOption;
  return option;
}
