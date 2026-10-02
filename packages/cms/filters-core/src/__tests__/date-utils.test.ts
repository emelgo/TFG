import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRelativeDateValue,
  extractRelativeDateOption,
  getDateRangeForOperator,
  getRelativeDateRange,
  isRangeOperator,
  isRelativeDate,
  mapDateOperator,
  resolveRelativeDate,
} from '../utils/date-utils';

describe('Date Utils', () => {
  // Mock a fixed date for consistent testing
  const mockDate = new Date('2024-01-15T12:00:00.000Z'); // Monday

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isRelativeDate', () => {
    it('should identify relative date strings', () => {
      expect(isRelativeDate('__rel_date:today')).toBe(true);
      expect(isRelativeDate('__rel_date:thisWeek')).toBe(true);
    });

    it('should reject non-relative date strings', () => {
      expect(isRelativeDate('2024-01-15')).toBe(false);
      expect(isRelativeDate('today')).toBe(false);
      expect(isRelativeDate(null)).toBe(false);
      expect(isRelativeDate(undefined)).toBe(false);
    });
  });

  describe('extractRelativeDateOption', () => {
    it('should extract relative date options', () => {
      expect(extractRelativeDateOption('__rel_date:today')).toBe('today');
      expect(extractRelativeDateOption('__rel_date:thisWeek')).toBe('thisWeek');
    });

    it('should return null for non-relative dates', () => {
      expect(extractRelativeDateOption('2024-01-15')).toBeNull();
      expect(extractRelativeDateOption('today')).toBeNull();
    });
  });

  describe('createRelativeDateValue', () => {
    it('should create relative date strings', () => {
      expect(createRelativeDateValue('today')).toBe('__rel_date:today');
      expect(createRelativeDateValue('thisWeek')).toBe('__rel_date:thisWeek');
    });
  });

  describe('getRelativeDateRange', () => {
    it('should return correct range for "today"', () => {
      const range = getRelativeDateRange('today', { referenceDate: mockDate });

      expect(range.start).toEqual(startOfDay(mockDate));
      expect(range.end).toEqual(endOfDay(mockDate));
    });

    it('should return correct range for "thisWeek"', () => {
      const range = getRelativeDateRange('thisWeek', {
        referenceDate: mockDate,
      });

      expect(range.start).toEqual(startOfWeek(mockDate, { weekStartsOn: 1 }));
      expect(range.end).toEqual(
        endOfDay(endOfWeek(mockDate, { weekStartsOn: 1 })),
      );
    });

    it('should return correct range for "thisMonth"', () => {
      const range = getRelativeDateRange('thisMonth', {
        referenceDate: mockDate,
      });

      expect(range.start).toEqual(startOfMonth(mockDate));
      expect(range.end).toEqual(endOfDay(endOfMonth(mockDate)));
    });

    it('should return correct range for "thisYear"', () => {
      const range = getRelativeDateRange('thisYear', {
        referenceDate: mockDate,
      });

      expect(range.start).toEqual(startOfYear(mockDate));
      expect(range.end).toEqual(endOfDay(endOfYear(mockDate)));
    });

    it('should handle "last7Days" correctly', () => {
      const range = getRelativeDateRange('last7Days', {
        referenceDate: mockDate,
      });

      // Should include today and 6 days before
      const expectedStart = new Date(mockDate);
      expectedStart.setDate(expectedStart.getDate() - 6);
      expectedStart.setHours(0, 0, 0, 0);

      expect(range.start).toEqual(expectedStart);
      expect(range.end).toEqual(endOfDay(mockDate));
    });

    it('should handle "last30Days" correctly', () => {
      const range = getRelativeDateRange('last30Days', {
        referenceDate: mockDate,
      });

      // Should include today and 29 days before
      const expectedStart = new Date(mockDate);
      expectedStart.setDate(expectedStart.getDate() - 29);
      expectedStart.setHours(0, 0, 0, 0);

      expect(range.start).toEqual(expectedStart);
      expect(range.end).toEqual(endOfDay(mockDate));
    });
  });

  describe('resolveRelativeDate', () => {
    it('should resolve relative dates to start date', () => {
      const result = resolveRelativeDate('__rel_date:today', {
        referenceDate: mockDate,
      });

      expect(result).toEqual(startOfDay(mockDate));
    });

    it('should return non-relative dates unchanged', () => {
      const dateStr = '2024-01-15';
      const result = resolveRelativeDate(dateStr);

      expect(result).toBe(dateStr);
    });
  });

  describe('getDateRangeForOperator', () => {
    it('should return range for range operators with relative dates', () => {
      const range = getDateRangeForOperator('__rel_date:today', 'between', {
        referenceDate: mockDate,
      });

      expect(range).not.toBeNull();
      expect(range!.start).toEqual(startOfDay(mockDate));
      expect(range!.end).toEqual(endOfDay(mockDate));
    });

    it('should return null for non-range operators', () => {
      const range = getDateRangeForOperator('__rel_date:today', 'eq');

      expect(range).toBeNull();
    });

    it('should handle comma-separated date ranges', () => {
      const range = getDateRangeForOperator('2024-01-01,2024-01-31', 'between');

      expect(range).not.toBeNull();
      expect(range!.start).toEqual(new Date('2024-01-01'));
      expect(range!.end).toEqual(new Date('2024-01-31'));
    });
  });

  describe('isRangeOperator', () => {
    it('should identify range operators', () => {
      expect(isRangeOperator('between')).toBe(true);
      expect(isRangeOperator('notBetween')).toBe(true);
      expect(isRangeOperator('during')).toBe(true);
    });

    it('should reject non-range operators', () => {
      expect(isRangeOperator('eq')).toBe(false);
      expect(isRangeOperator('lt')).toBe(false);
      expect(isRangeOperator('gt')).toBe(false);
    });
  });

  describe('mapDateOperator', () => {
    it('should map date operators to SQL equivalents', () => {
      expect(mapDateOperator('before')).toBe('lt');
      expect(mapDateOperator('beforeOrOn')).toBe('lte');
      expect(mapDateOperator('after')).toBe('gt');
      expect(mapDateOperator('afterOrOn')).toBe('gte');
      expect(mapDateOperator('during')).toBe('eq');
    });

    it('should return unmapped operators unchanged', () => {
      expect(mapDateOperator('eq')).toBe('eq');
      expect(mapDateOperator('custom')).toBe('custom');
    });
  });
});
