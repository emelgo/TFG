import { describe, expect, it, vi } from 'vitest';

import type { AdvancedFilterCondition } from '../../types';
import {
  extractTrendFilters,
  isTrendFilter,
  parseAbsoluteDateRange,
  parseRelativeDateRange,
  parseTrendFilterDateRange,
  parseTrendFilters,
} from '../trend-filter-parser';

// Mock the filters-core module
vi.mock('@pymekit/cms-filters-core', () => ({
  extractRelativeDateOption: vi.fn((value: string) => {
    if (value === '__rel_date:last7Days') return 'last7Days';
    if (value === '__rel_date:last30Days') return 'last30Days';
    if (value === '__rel_date:thisMonth') return 'thisMonth';
    return null;
  }),
  getRelativeDateRange: vi.fn((option: string) => {
    const now = new Date('2023-08-16T12:00:00Z');

    switch (option) {
      case 'last7Days':
        return {
          start: new Date('2023-08-10T00:00:00Z'),
          end: new Date('2023-08-16T23:59:59.999Z'),
        };
      case 'last30Days':
        return {
          start: new Date('2023-07-18T00:00:00Z'),
          end: new Date('2023-08-16T23:59:59.999Z'),
        };
      case 'thisMonth':
        return {
          start: new Date('2023-08-01T00:00:00Z'),
          end: new Date('2023-08-31T23:59:59.999Z'),
        };
      default:
        throw new Error(`Unknown option: ${option}`);
    }
  }),
}));

describe('Trend Filter Parser', () => {
  describe('isTrendFilter', () => {
    it('should return true for filters with isTrendFilter config', () => {
      const filter: AdvancedFilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '__rel_date:last7Days',
        config: { isTrendFilter: true },
      };

      expect(isTrendFilter(filter)).toBe(true);
    });

    it('should return false for filters without isTrendFilter config', () => {
      const filter: AdvancedFilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '__rel_date:last7Days',
      };

      expect(isTrendFilter(filter)).toBe(false);
    });

    it('should return false for filters with isTrendFilter set to false', () => {
      const filter: AdvancedFilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '__rel_date:last7Days',
        config: { isTrendFilter: false },
      };

      expect(isTrendFilter(filter)).toBe(false);
    });
  });

  describe('extractTrendFilters', () => {
    it('should extract only trend filters from a mixed list', () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'contains',
          value: 'test',
        },
        {
          column: 'created_at',
          operator: 'eq',
          value: '__rel_date:last7Days',
          config: { isTrendFilter: true },
        },
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
        },
        {
          column: 'updated_at',
          operator: 'between',
          value: '2023-01-01,2023-12-31',
          config: { isTrendFilter: true },
        },
      ];

      const trendFilters = extractTrendFilters(filters);

      expect(trendFilters).toHaveLength(2);
      expect(trendFilters[0]?.column).toBe('created_at');
      expect(trendFilters[1]?.column).toBe('updated_at');
    });

    it('should return empty array when no trend filters exist', () => {
      const filters: AdvancedFilterCondition[] = [
        {
          column: 'name',
          operator: 'contains',
          value: 'test',
        },
        {
          column: 'status',
          operator: 'eq',
          value: 'active',
        },
      ];

      const trendFilters = extractTrendFilters(filters);
      expect(trendFilters).toHaveLength(0);
    });
  });

  describe('parseRelativeDateRange', () => {
    it('should parse __rel_date:last7Days correctly', () => {
      const result = parseRelativeDateRange('__rel_date:last7Days');

      expect(result.start).toEqual(new Date('2023-08-10T00:00:00Z'));
      expect(result.end).toEqual(new Date('2023-08-16T23:59:59.999Z'));
    });

    it('should parse __rel_date:thisMonth correctly', () => {
      const result = parseRelativeDateRange('__rel_date:thisMonth');

      expect(result.start).toEqual(new Date('2023-08-01T00:00:00Z'));
      expect(result.end).toEqual(new Date('2023-08-31T23:59:59.999Z'));
    });

    it('should throw error for invalid relative date option', () => {
      expect(() => {
        parseRelativeDateRange('__rel_date:invalidOption');
      }).toThrow('Invalid relative date option: __rel_date:invalidOption');
    });
  });

  describe('parseAbsoluteDateRange', () => {
    it('should parse comma-separated date range correctly', () => {
      const result = parseAbsoluteDateRange('2023-01-01,2023-12-31');

      expect(result.start).toEqual(new Date('2023-01-01'));
      expect(result.end).toEqual(new Date('2023-12-31'));
    });

    it('should handle date strings with time components', () => {
      const result = parseAbsoluteDateRange(
        '2023-01-01T00:00:00Z,2023-12-31T23:59:59Z',
      );

      expect(result.start).toEqual(new Date('2023-01-01T00:00:00Z'));
      expect(result.end).toEqual(new Date('2023-12-31T23:59:59Z'));
    });

    it('should throw error for missing start date', () => {
      expect(() => {
        parseAbsoluteDateRange(',2023-12-31');
      }).toThrow(
        'Invalid date range format. Both start and end dates are required.',
      );
    });

    it('should throw error for missing end date', () => {
      expect(() => {
        parseAbsoluteDateRange('2023-01-01,');
      }).toThrow(
        'Invalid date range format. Both start and end dates are required.',
      );
    });

    it('should throw error for invalid start date', () => {
      expect(() => {
        parseAbsoluteDateRange('invalid-date,2023-12-31');
      }).toThrow('Invalid dates in trend filter range');
    });

    it('should throw error for invalid end date', () => {
      expect(() => {
        parseAbsoluteDateRange('2023-01-01,invalid-date');
      }).toThrow('Invalid dates in trend filter range');
    });

    it('should throw error when start date is after end date', () => {
      expect(() => {
        parseAbsoluteDateRange('2023-12-31,2023-01-01');
      }).toThrow('Start date must be before end date in trend filter range.');
    });

    it('should throw error when start date equals end date', () => {
      expect(() => {
        parseAbsoluteDateRange('2023-01-01,2023-01-01');
      }).toThrow('Start date must be before end date in trend filter range.');
    });
  });

  describe('parseTrendFilterDateRange', () => {
    it('should parse relative date filter', () => {
      const filter: AdvancedFilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '__rel_date:last7Days',
        config: { isTrendFilter: true },
      };

      const result = parseTrendFilterDateRange(filter);

      expect(result.start).toEqual(new Date('2023-08-10T00:00:00Z'));
      expect(result.end).toEqual(new Date('2023-08-16T23:59:59.999Z'));
    });

    it('should parse absolute date range filter', () => {
      const filter: AdvancedFilterCondition = {
        column: 'created_at',
        operator: 'between',
        value: '2023-01-01,2023-12-31',
        config: { isTrendFilter: true },
      };

      const result = parseTrendFilterDateRange(filter);

      expect(result.start).toEqual(new Date('2023-01-01'));
      expect(result.end).toEqual(new Date('2023-12-31'));
    });

    it('should throw error for non-string value', () => {
      const filter: AdvancedFilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: 123,
        config: { isTrendFilter: true },
      };

      expect(() => {
        parseTrendFilterDateRange(filter);
      }).toThrow('Trend filter must have a valid string value.');
    });

    it('should throw error for empty string value', () => {
      const filter: AdvancedFilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '',
        config: { isTrendFilter: true },
      };

      expect(() => {
        parseTrendFilterDateRange(filter);
      }).toThrow('Trend filter must have a valid string value.');
    });

    it('should throw error for unsupported format', () => {
      const filter: AdvancedFilterCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '2023-01-01', // Single date, not supported
        config: { isTrendFilter: true },
      };

      expect(() => {
        parseTrendFilterDateRange(filter);
      }).toThrow(
        'Invalid trend filter date range format: "2023-01-01". Expected "__rel_date:option" or "start,end" format.',
      );
    });
  });

  describe('parseTrendFilters', () => {
    it('should parse trend filters and calculate previous period correctly', () => {
      const trendFilters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'eq',
          value: '__rel_date:last7Days',
          config: { isTrendFilter: true },
        },
      ];

      const result = parseTrendFilters(trendFilters);

      expect(result.trendColumn).toBe('created_at');
      expect(result.currentPeriod.start).toEqual(
        new Date('2023-08-10T00:00:00Z'),
      );
      expect(result.currentPeriod.end).toEqual(
        new Date('2023-08-16T23:59:59.999Z'),
      );

      // Previous period should be 7 days before (same duration)
      const expectedPreviousPeriodDuration =
        result.currentPeriod.end.getTime() -
        result.currentPeriod.start.getTime();
      const actualPreviousPeriodDuration =
        result.previousPeriod.end.getTime() -
        result.previousPeriod.start.getTime();

      expect(actualPreviousPeriodDuration).toBe(expectedPreviousPeriodDuration);

      // Both bounds are an inclusive BETWEEN, so ending exactly on
      // `currentPeriod.start` would place that instant in both periods.
      expect(result.previousPeriod.end.getTime()).toBe(
        result.currentPeriod.start.getTime() - 1,
      );
    });

    // Regression: "current" ranges end at end-of-day, i.e. in the future, while
    // the previous period is fully elapsed — biasing every trend downward.
    it('should clamp a current period that extends into the future', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-08-16T12:00:00Z'));

      try {
        const trendFilters: AdvancedFilterCondition[] = [
          {
            column: 'created_at',
            operator: 'eq',
            value: '__rel_date:thisMonth',
            config: { isTrendFilter: true },
          },
        ];

        const result = parseTrendFilters(trendFilters);

        // Not the requested 2023-08-31T23:59:59.999Z
        expect(result.currentPeriod.end).toEqual(
          new Date('2023-08-16T12:00:00Z'),
        );

        // ...and the previous window matches the elapsed portion
        const currentDuration =
          result.currentPeriod.end.getTime() -
          result.currentPeriod.start.getTime();
        const previousDuration =
          result.previousPeriod.end.getTime() -
          result.previousPeriod.start.getTime();

        expect(previousDuration).toBe(currentDuration);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw error for empty trend filters array', () => {
      expect(() => {
        parseTrendFilters([]);
      }).toThrow('No trend filters provided for trend analysis.');
    });

    it('should use first trend filter when multiple are provided', () => {
      const trendFilters: AdvancedFilterCondition[] = [
        {
          column: 'created_at',
          operator: 'eq',
          value: '__rel_date:last7Days',
          config: { isTrendFilter: true },
        },
        {
          column: 'updated_at',
          operator: 'between',
          value: '2023-01-01,2023-12-31',
          config: { isTrendFilter: true },
        },
      ];

      const result = parseTrendFilters(trendFilters);

      // Should use the first filter (created_at with last7Days)
      expect(result.trendColumn).toBe('created_at');
      expect(result.currentPeriod.start).toEqual(
        new Date('2023-08-10T00:00:00Z'),
      );
    });

    describe('Edge Cases', () => {
      it('should handle very short time periods (1 hour)', () => {
        const trendFilters: AdvancedFilterCondition[] = [
          {
            column: 'created_at',
            operator: 'between',
            value: '2023-08-16T12:00:00Z,2023-08-16T13:00:00Z',
            config: { isTrendFilter: true },
          },
        ];

        const result = parseTrendFilters(trendFilters);

        const periodDuration =
          result.currentPeriod.end.getTime() -
          result.currentPeriod.start.getTime();
        expect(periodDuration).toBe(60 * 60 * 1000); // 1 hour in milliseconds

        const previousDuration =
          result.previousPeriod.end.getTime() -
          result.previousPeriod.start.getTime();
        expect(previousDuration).toBe(periodDuration);
      });

      it('should handle very long time periods (1 year)', () => {
        const trendFilters: AdvancedFilterCondition[] = [
          {
            column: 'created_at',
            operator: 'between',
            value: '2022-01-01,2023-01-01',
            config: { isTrendFilter: true },
          },
        ];

        const result = parseTrendFilters(trendFilters);

        const periodDuration =
          result.currentPeriod.end.getTime() -
          result.currentPeriod.start.getTime();
        const previousDuration =
          result.previousPeriod.end.getTime() -
          result.previousPeriod.start.getTime();

        expect(previousDuration).toBe(periodDuration);
        expect(result.previousPeriod.end.getTime()).toBe(
          result.currentPeriod.start.getTime() - 1,
        );
      });
    });
  });
});
