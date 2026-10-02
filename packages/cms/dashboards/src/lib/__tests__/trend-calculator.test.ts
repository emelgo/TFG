import { describe, expect, it } from 'vitest';

import {
  calculateTrend,
  calculateTrendDateRanges,
  extractMetricValue,
  getCommonDateColumns,
} from '../trend-calculator';

describe('trend-calculator', () => {
  describe('calculateTrend', () => {
    it('should return up trend for increasing values', () => {
      const currentStart = new Date('2024-01-08T00:00:00Z');
      const previousStart = new Date('2024-01-01T00:00:00Z');
      const previousEnd = new Date('2024-01-08T00:00:00Z');

      const result = calculateTrend(
        150,
        100,
        currentStart,
        previousStart,
        previousEnd,
      );

      expect(result.trend).toBe('up');
      expect(result.trendPercentage).toBe(50);
      expect(result.currentPeriodStart).toEqual(currentStart);
      expect(result.previousPeriodStart).toEqual(previousStart);
      expect(result.previousPeriodEnd).toEqual(previousEnd);
    });

    it('should return down trend for decreasing values', () => {
      const currentStart = new Date('2024-01-08T00:00:00Z');
      const previousStart = new Date('2024-01-01T00:00:00Z');
      const previousEnd = new Date('2024-01-08T00:00:00Z');

      const result = calculateTrend(
        80,
        100,
        currentStart,
        previousStart,
        previousEnd,
      );

      expect(result.trend).toBe('down');
      expect(result.trendPercentage).toBe(-20);
    });

    it('should return stable trend for minimal changes', () => {
      const currentStart = new Date('2024-01-08T00:00:00Z');
      const previousStart = new Date('2024-01-01T00:00:00Z');
      const previousEnd = new Date('2024-01-08T00:00:00Z');

      const result = calculateTrend(
        100,
        100,
        currentStart,
        previousStart,
        previousEnd,
      );

      expect(result.trend).toBe('stable');
      expect(result.trendPercentage).toBe(0);
    });

    it('should return stable trend for changes within threshold', () => {
      const currentStart = new Date('2024-01-08T00:00:00Z');
      const previousStart = new Date('2024-01-01T00:00:00Z');
      const previousEnd = new Date('2024-01-08T00:00:00Z');

      const result = calculateTrend(
        100.5,
        100,
        currentStart,
        previousStart,
        previousEnd,
      );

      expect(result.trend).toBe('stable');
      expect(result.trendPercentage).toBe(0.5);
    });

    it('should handle zero previous value correctly', () => {
      const currentStart = new Date('2024-01-08T00:00:00Z');
      const previousStart = new Date('2024-01-01T00:00:00Z');
      const previousEnd = new Date('2024-01-08T00:00:00Z');

      const result = calculateTrend(
        50,
        0,
        currentStart,
        previousStart,
        previousEnd,
      );

      expect(result.trend).toBe('up');
      expect(result.trendPercentage).toBe(100);
    });

    it('should handle zero current value with zero previous value', () => {
      const currentStart = new Date('2024-01-08T00:00:00Z');
      const previousStart = new Date('2024-01-01T00:00:00Z');
      const previousEnd = new Date('2024-01-08T00:00:00Z');

      const result = calculateTrend(
        0,
        0,
        currentStart,
        previousStart,
        previousEnd,
      );

      expect(result.trend).toBe('stable');
      expect(result.trendPercentage).toBe(0);
    });
  });

  describe('calculateTrendDateRanges', () => {
    it('should calculate correct date ranges for 7-day period', () => {
      const baseDate = new Date('2024-01-15T12:00:00Z');
      const result = calculateTrendDateRanges(7, baseDate);

      // Current period: last 7 days (Jan 8 - Jan 15)
      expect(result.currentPeriod.start).toEqual(
        new Date('2024-01-08T12:00:00Z'),
      );

      // Previous period: 7 days before that (Jan 1 - Jan 8)
      expect(result.previousPeriod.start).toEqual(
        new Date('2024-01-01T12:00:00Z'),
      );
      expect(result.previousPeriod.end).toEqual(
        new Date('2024-01-08T12:00:00Z'),
      );
    });

    it('should calculate correct date ranges for 30-day period', () => {
      const baseDate = new Date('2024-02-15T12:00:00Z');
      const result = calculateTrendDateRanges(30, baseDate);

      // Current period: last 30 days (Jan 16 - Feb 15)
      expect(result.currentPeriod.start).toEqual(
        new Date('2024-01-16T12:00:00Z'),
      );

      // Previous period: 30 days before that (Dec 17 - Jan 16)
      expect(result.previousPeriod.start).toEqual(
        new Date('2023-12-17T12:00:00Z'),
      );
      expect(result.previousPeriod.end).toEqual(
        new Date('2024-01-16T12:00:00Z'),
      );
    });

    it('should use current date by default', () => {
      const now = Date.now();
      const result = calculateTrendDateRanges(7);

      const expectedCurrentStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const expectedPreviousStart = new Date(
        expectedCurrentStart.getTime() - 7 * 24 * 60 * 60 * 1000,
      );

      // Allow for small timing differences in test execution
      expect(
        Math.abs(
          result.currentPeriod.start.getTime() - expectedCurrentStart.getTime(),
        ),
      ).toBeLessThan(1000);
      expect(
        Math.abs(
          result.previousPeriod.start.getTime() -
            expectedPreviousStart.getTime(),
        ),
      ).toBeLessThan(1000);
    });
  });

  describe('extractMetricValue', () => {
    it('should extract count value from aggregation result', () => {
      const data = [{ count: 42 }];
      const result = extractMetricValue(data);

      expect(result).toBe(42);
    });

    it('should extract sum value from aggregation result', () => {
      const data = [{ sum: 1250.5 }];
      const result = extractMetricValue(data);

      expect(result).toBe(1250.5);
    });

    it('should handle string numeric values', () => {
      const data = [{ count: '123' }];
      const result = extractMetricValue(data);

      expect(result).toBe(123);
    });

    // `null` rather than 0, else the trend maths compares against a baseline
    // that was never measured.
    it('should return null for empty data', () => {
      const result = extractMetricValue([]);

      expect(result).toBeNull();
    });

    it('should return null for null/undefined data', () => {
      expect(extractMetricValue(null as any)).toBeNull();
      expect(extractMetricValue(undefined as any)).toBeNull();
    });

    it('should return null for a SQL NULL aggregate', () => {
      // An ungrouped aggregate over zero rows returns one row, not none
      expect(extractMetricValue([{ value: null }])).toBeNull();
      expect(extractMetricValue([{ avg: null }])).toBeNull();
    });

    it('should still return a real zero unchanged', () => {
      expect(extractMetricValue([{ value: 0 }])).toBe(0);
      expect(extractMetricValue([{ count: '0' }])).toBe(0);
    });

    it('should find first numeric value if no standard columns exist', () => {
      const data = [{ custom_metric: 999, other_field: 'text' }];
      const result = extractMetricValue(data);

      expect(result).toBe(999);
    });

    it('should handle invalid string numbers', () => {
      const data = [{ count: 'not-a-number' }];
      const result = extractMetricValue(data);

      expect(result).toBeNull();
    });
  });

  describe('getCommonDateColumns', () => {
    it('should return array of common date column names', () => {
      const result = getCommonDateColumns();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('created_at');
      expect(result).toContain('updated_at');
    });
  });
});
