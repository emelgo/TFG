import type { ColumnMetadata } from '@pymekit/cms-types';

/**
 * Core filter condition interface
 */
export interface FilterCondition {
  column: string;
  operator: string;
  value: unknown;
  logicalOperator?: 'AND' | 'OR';
}

/**
 * Processed value with metadata for SQL generation
 */
export interface ProcessedValue {
  escaped: string;
  isRange?: boolean;
  start?: string;
  end?: string;
  original: unknown;
  // Extended metadata fields for enhanced processors (optional)
  value?: unknown;
  isProcessed?: boolean;
  sqlHint?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Filter context for service-specific behavior
 */
export interface FilterContext {
  serviceType: 'data-explorer' | 'widgets' | 'custom';
  columns: ColumnMetadata[];
  customHandlers?: Record<string, FilterHandler>;
  escapeStrategy?: 'raw-sql' | 'drizzle';
}

/**
 * Custom filter handler interface
 */
export interface FilterHandler {
  canHandle(condition: FilterCondition, context: FilterContext): boolean;
  process(condition: FilterCondition, context: FilterContext): string;
}

/**
 * Value processor interface for different data types
 */
export interface ValueProcessor {
  process(
    value: unknown,
    operator: string,
    column: ColumnMetadata,
  ): ProcessedValue;
}

/**
 * Optional context wrapper used by some processors/tests
 */
export interface ValueProcessorOptions {
  operator?: string;
  column?: ColumnMetadata;
}

/**
 * Operator definition interface
 */
export interface OperatorDefinition {
  key: string;
  sqlTemplate: string;
  needsWrapping?: boolean;
  supportedTypes: string[];
  generateSql(
    column: string,
    value: ProcessedValue,
    context: FilterContext,
  ): string;
}

/**
 * Relative date options
 */
export type RelativeDateOption =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'thisWeek'
  | 'lastWeek'
  | 'nextWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'nextMonth'
  | 'last7Days'
  | 'next7Days'
  | 'last30Days'
  | 'next30Days'
  | 'thisYear'
  | 'lastYear'
  | 'custom';

/**
 * Date range result
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Filter validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
