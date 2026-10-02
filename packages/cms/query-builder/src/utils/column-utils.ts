/**
 * Utility functions for column analysis and identification
 */

/**
 * Check if column name suggests aggregation result
 * Useful for identifying columns that contain aggregated data
 * based on common naming patterns in SQL queries
 *
 * @param columnName - The column name to analyze
 * @returns true if the column name suggests it contains aggregated data
 *
 * @example
 * ```typescript
 * isAggregationColumn('count') // true
 * isAggregationColumn('total_revenue') // false
 * isAggregationColumn('sum_sales') // true
 * isAggregationColumn('value') // true (common alias for metrics)
 * ```
 */
export function isAggregationColumn(columnName: string): boolean {
  const lowerName = columnName.toLowerCase();

  // Exact matches
  const exactMatches = [
    'value',
    'count',
    'sum',
    'avg',
    'average',
    'min',
    'max',
  ];
  if (exactMatches.includes(lowerName)) {
    return true;
  }

  // Prefix matches (more specific)
  const prefixPatterns = ['count_', 'sum_', 'avg_', 'min_', 'max_'];
  if (prefixPatterns.some((prefix) => lowerName.startsWith(prefix))) {
    return true;
  }

  // Suffix matches (more specific)
  const suffixPatterns = ['_count', '_sum', '_avg', '_average', '_min', '_max'];
  if (suffixPatterns.some((suffix) => lowerName.endsWith(suffix))) {
    return true;
  }

  // Word boundary matches (avoid false positives like "account", "discount")
  const wordBoundaryPatterns = [
    /\bcount\b/,
    /\bsum\b/,
    /\bavg\b/,
    /\baverage\b/,
    /\bmin\b/,
    /\bmax\b/,
  ];

  return wordBoundaryPatterns.some((pattern) => pattern.test(lowerName));
}

/**
 * Extract the aggregation type from a column name if it appears to be aggregated
 *
 * @param columnName - The column name to analyze
 * @returns The detected aggregation type or null if none detected
 *
 * @example
 * ```typescript
 * getAggregationTypeFromColumn('sum_sales') // 'sum'
 * getAggregationTypeFromColumn('count_users') // 'count'
 * getAggregationTypeFromColumn('regular_column') // null
 * ```
 */
export function getAggregationTypeFromColumn(
  columnName: string,
): string | null {
  const lowerName = columnName.toLowerCase();

  // Direct matches (highest priority)
  if (lowerName === 'count') return 'count';
  if (lowerName === 'sum') return 'sum';
  if (lowerName === 'avg' || lowerName === 'average') return 'avg';
  if (lowerName === 'min') return 'min';
  if (lowerName === 'max') return 'max';
  if (lowerName === 'value') return 'value'; // Generic aggregation alias

  // Prefix matches (second priority)
  if (lowerName.startsWith('count_')) return 'count';
  if (lowerName.startsWith('sum_')) return 'sum';
  if (lowerName.startsWith('avg_')) return 'avg';
  if (lowerName.startsWith('min_')) return 'min';
  if (lowerName.startsWith('max_')) return 'max';

  // Suffix matches (third priority)
  if (lowerName.endsWith('_count')) return 'count';
  if (lowerName.endsWith('_sum')) return 'sum';
  if (lowerName.endsWith('_avg') || lowerName.endsWith('_average'))
    return 'avg';
  if (lowerName.endsWith('_min')) return 'min';
  if (lowerName.endsWith('_max')) return 'max';

  // Word boundary matches (lowest priority, avoid false positives)
  if (/\bcount\b/.test(lowerName)) return 'count';
  if (/\bsum\b/.test(lowerName)) return 'sum';
  if (/\bavg\b/.test(lowerName) || /\baverage\b/.test(lowerName)) return 'avg';
  if (/\bmin\b/.test(lowerName)) return 'min';
  if (/\bmax\b/.test(lowerName)) return 'max';

  return null;
}

/**
 * Check if a column name appears to be a time bucket column
 * Common in time-series aggregation queries
 *
 * @param columnName - The column name to analyze
 * @returns true if the column appears to be a time bucket
 *
 * @example
 * ```typescript
 * isTimeBucketColumn('date_trunc') // true
 * isTimeBucketColumn('time_bucket') // true
 * isTimeBucketColumn('bucket') // true
 * isTimeBucketColumn('regular_date') // false
 * ```
 */
export function isTimeBucketColumn(columnName: string): boolean {
  const lowerName = columnName.toLowerCase();
  const timeBucketPatterns = [
    'bucket',
    'time_bucket',
    'date_trunc',
    'date_bucket',
    'period',
    'interval',
  ];

  return timeBucketPatterns.some(
    (pattern) => lowerName === pattern || lowerName.includes(pattern),
  );
}
