/**
 * Aggregation types for SQL query building
 */

/**
 * Supported aggregation functions (lowercase)
 */
export type AggregationType = 'count' | 'sum' | 'avg' | 'min' | 'max';

/**
 * Supported aggregation functions (uppercase - for compatibility)
 */
export type AggregationTypeUpper = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

/**
 * Combined aggregation types for compatibility
 */
export type AggregationTypeCompat = AggregationType | AggregationTypeUpper;

/**
 * Legacy aggregation clause interface (for backward compatibility)
 */
export interface AggregationClause {
  readonly type:
    | 'COUNT'
    | 'SUM'
    | 'AVG'
    | 'MIN'
    | 'MAX'
    | 'COUNT_DISTINCT'
    | 'ARRAY_AGG';
}

/**
 * Time intervals for time-series aggregation
 */
export type TimeInterval =
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year';

/**
 * Aggregation configuration
 */
export interface AggregationConfig {
  readonly type: AggregationType;
  readonly column?: string;
  readonly alias?: string;
  readonly distinct?: boolean;
}

/**
 * Time bucket configuration for time-series data
 */
export interface TimeBucketConfig {
  readonly column: string;
  readonly interval: TimeInterval;
  readonly alias?: string;
}

/**
 * Multi-series configuration for grouped aggregations
 */
export interface MultiSeriesConfig {
  readonly enabled: boolean;
  readonly groupByColumns: readonly string[];
  readonly groupBy?: string;
  readonly limit?: number;
}
