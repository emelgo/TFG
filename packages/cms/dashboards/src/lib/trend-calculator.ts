/**
 * Utility functions for calculating trends and date ranges for metric widgets
 */

export interface TrendResult {
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
  currentPeriodStart: Date;
  previousPeriodStart: Date;
  previousPeriodEnd: Date;
}

export interface DateRange {
  start: Date;
  end?: Date;
}

/**
 * Calculate date ranges for trend analysis
 */
export function calculateTrendDateRanges(
  trendPeriod: number,
  baseDate: Date = new Date(),
): {
  currentPeriod: DateRange;
  previousPeriod: DateRange;
} {
  const trendPeriodMs = trendPeriod * 24 * 60 * 60 * 1000;

  // Current period: last N days from base date
  const currentPeriodStart = new Date(baseDate.getTime() - trendPeriodMs);

  // Previous period: N to 2N days ago from base date
  const previousPeriodStart = new Date(
    currentPeriodStart.getTime() - trendPeriodMs,
  );

  const previousPeriodEnd = currentPeriodStart;

  return {
    currentPeriod: {
      start: currentPeriodStart,
    },
    previousPeriod: {
      start: previousPeriodStart,
      end: previousPeriodEnd,
    },
  };
}

/**
 * Calculate trend direction and percentage change
 */
export function calculateTrend(
  currentValue: number,
  previousValue: number,
  currentPeriodStart: Date,
  previousPeriodStart: Date,
  previousPeriodEnd: Date,
): TrendResult {
  const threshold = 0.01; // 1% threshold for "stable"

  // Handle zero previous value case
  if (previousValue === 0) {
    return {
      trend: currentValue > 0 ? 'up' : 'stable',
      trendPercentage: currentValue > 0 ? 100 : 0,
      currentPeriodStart,
      previousPeriodStart,
      previousPeriodEnd,
    };
  }

  // Calculate percentage change
  const trendPercentage =
    ((currentValue - previousValue) / previousValue) * 100;

  const changePercentage = Math.abs(trendPercentage / 100);

  // Determine trend direction
  let trend: 'up' | 'down' | 'stable';

  if (changePercentage < threshold) {
    trend = 'stable';
  } else {
    trend = currentValue > previousValue ? 'up' : 'down';
  }

  return {
    trend,
    trendPercentage,
    currentPeriodStart,
    previousPeriodStart,
    previousPeriodEnd,
  };
}

/**
 * Extract numeric value from query result data.
 *
 * Returns `null` when the period has no value, rather than 0. A metric query is
 * an ungrouped aggregate, so an empty period returns one row of
 * `{ value: null }` — collapsing that to 0 fabricated a +100% trend.
 */
export function extractMetricValue(data: unknown[]): number | null {
  if (!data || data.length === 0) {
    return null;
  }

  const firstRow = data[0] as Record<string, unknown>;

  // Look for common aggregation result column names
  const possibleColumns = ['count', 'sum', 'avg', 'min', 'max', 'value'];

  for (const col of possibleColumns) {
    if (col in firstRow) {
      const value = firstRow[col];

      if (value === null || value === undefined) {
        return null;
      }

      if (typeof value === 'number') {
        return value;
      }

      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
      }
    }
  }

  // If no standard column found, try to get the first numeric value
  for (const value of Object.values(firstRow)) {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = parseFloat(value);

      if (!isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Get common date column names to suggest to users
 * These are just suggestions - users must explicitly select one
 */
export function getCommonDateColumns(): string[] {
  return [
    'created_at',
    'updated_at',
    'timestamp',
    'date',
    'created',
    'modified',
    'date_created',
    'date_modified',
    'published_at',
    'order_date',
    'event_date',
  ];
}
