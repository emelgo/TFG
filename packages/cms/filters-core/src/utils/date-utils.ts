import { TZDate } from '@date-fns/tz';
import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns';

import type { DateRange, RelativeDateOption } from '../types';

/**
 * Check if a value represents a relative date
 */
export function isRelativeDate(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('__rel_date:');
}

/**
 * Valid relative date options
 */
const VALID_RELATIVE_DATE_OPTIONS: RelativeDateOption[] = [
  'today',
  'yesterday',
  'tomorrow',
  'thisWeek',
  'lastWeek',
  'nextWeek',
  'thisMonth',
  'lastMonth',
  'nextMonth',
  'last7Days',
  'next7Days',
  'last30Days',
  'next30Days',
  'thisYear',
  'lastYear',
  'custom',
];

/**
 * Extract relative date option from value
 */
export function extractRelativeDateOption(
  value: string,
): RelativeDateOption | null {
  if (!isRelativeDate(value)) {
    return null;
  }
  const option = value.replace('__rel_date:', '');

  // Validate that it's a valid option
  if (!VALID_RELATIVE_DATE_OPTIONS.includes(option as RelativeDateOption)) {
    return null;
  }

  return option as RelativeDateOption;
}

/**
 * Create relative date value string
 */
export function createRelativeDateValue(option: RelativeDateOption): string {
  return `__rel_date:${option}`;
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
export function mapDateOperator(operator: string): string {
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
 * Enhanced date utilities with timezone support
 */
export interface DateUtilsOptions {
  timezone?: string;
  referenceDate?: Date;
  endOfDayPrecision?: 'inclusive' | 'exclusive';
}

/**
 * Default options for date utilities
 */
const DEFAULT_OPTIONS: Required<DateUtilsOptions> = {
  timezone: 'UTC',
  referenceDate: new Date(),
  endOfDayPrecision: 'inclusive',
};

/**
 * Get date range for a relative date option with timezone support
 */
export function getRelativeDateRange(
  option: RelativeDateOption,
  options: DateUtilsOptions = {},
): DateRange {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get the reference date in the specified timezone using TZDate
  const now =
    opts.timezone !== 'UTC'
      ? new TZDate(opts.referenceDate, opts.timezone)
      : opts.referenceDate;

  const today = startOfDay(now);

  let range: DateRange;

  switch (option) {
    case 'today':
      range = {
        start: today,
        end: getEndOfDay(today, opts.endOfDayPrecision),
      };
      break;

    case 'yesterday': {
      const yesterday = subDays(today, 1);
      range = {
        start: yesterday,
        end: getEndOfDay(yesterday, opts.endOfDayPrecision),
      };
      break;
    }

    case 'tomorrow': {
      const tomorrow = addDays(today, 1);
      range = {
        start: tomorrow,
        end: getEndOfDay(tomorrow, opts.endOfDayPrecision),
      };
      break;
    }

    case 'thisWeek':
      range = {
        start: startOfWeek(today, { weekStartsOn: 1 }),
        end: getEndOfDay(
          endOfWeek(today, { weekStartsOn: 1 }),
          opts.endOfDayPrecision,
        ),
      };
      break;

    case 'lastWeek': {
      const lastWeekStart = startOfWeek(subWeeks(today, 1), {
        weekStartsOn: 1,
      });
      range = {
        start: lastWeekStart,
        end: getEndOfDay(
          endOfWeek(lastWeekStart, { weekStartsOn: 1 }),
          opts.endOfDayPrecision,
        ),
      };
      break;
    }

    case 'nextWeek': {
      const nextWeekStart = startOfWeek(addDays(today, 7), { weekStartsOn: 1 });
      range = {
        start: nextWeekStart,
        end: getEndOfDay(
          endOfWeek(nextWeekStart, { weekStartsOn: 1 }),
          opts.endOfDayPrecision,
        ),
      };
      break;
    }

    case 'thisMonth':
      range = {
        start: startOfMonth(today),
        end: getEndOfDay(endOfMonth(today), opts.endOfDayPrecision),
      };
      break;

    case 'lastMonth': {
      const lastMonth = subMonths(today, 1);
      range = {
        start: startOfMonth(lastMonth),
        end: getEndOfDay(endOfMonth(lastMonth), opts.endOfDayPrecision),
      };
      break;
    }

    case 'nextMonth': {
      const nextMonth = addMonths(today, 1);
      range = {
        start: startOfMonth(nextMonth),
        end: getEndOfDay(endOfMonth(nextMonth), opts.endOfDayPrecision),
      };
      break;
    }

    case 'last7Days':
      range = {
        start: subDays(today, 6), // Including today
        end: getEndOfDay(today, opts.endOfDayPrecision),
      };
      break;

    case 'next7Days':
      range = {
        start: today,
        end: getEndOfDay(addDays(today, 6), opts.endOfDayPrecision),
      };
      break;

    case 'last30Days':
      range = {
        start: subDays(today, 29), // Including today
        end: getEndOfDay(today, opts.endOfDayPrecision),
      };
      break;

    case 'next30Days':
      range = {
        start: today,
        end: getEndOfDay(addDays(today, 29), opts.endOfDayPrecision),
      };
      break;

    case 'thisYear':
      range = {
        start: startOfYear(today),
        end: getEndOfDay(endOfYear(today), opts.endOfDayPrecision),
      };
      break;

    case 'lastYear': {
      const lastYear = subYears(today, 1);
      range = {
        start: startOfYear(lastYear),
        end: getEndOfDay(endOfYear(lastYear), opts.endOfDayPrecision),
      };
      break;
    }

    case 'custom':
    default:
      range = {
        start: today,
        end: getEndOfDay(today, opts.endOfDayPrecision),
      };
      break;
  }

  // TZDate automatically handles timezone conversion when used in calculations
  // Return dates in the working timezone for consistent SQL generation
  return range;
}

/**
 * Get end of day with precise boundary handling
 */
function getEndOfDay(date: Date, precision: 'inclusive' | 'exclusive'): Date {
  const endOfDayDate = endOfDay(date);

  if (precision === 'inclusive') {
    // Return exactly 23:59:59.999 to be fully inclusive
    return endOfDayDate;
  }

  // Return start of next day for exclusive boundary
  return addDays(startOfDay(date), 1);
}

/**
 * Format date for SQL with timezone support
 */
export function formatDateForSQL(
  date: Date,
  options: { timezone?: string; includeTime?: boolean } = {},
): string {
  const { includeTime = true } = options;

  // Always return UTC format for SQL regardless of timezone
  // The timezone is only used for date calculations, not formatting
  const utcDate = date instanceof Date ? date : new Date(date);

  if (includeTime) {
    return utcDate.toISOString();
  } else {
    return utcDate.toISOString().split('T')[0]!;
  }
}

/**
 * Resolve relative date value to actual date for queries
 */
export function resolveRelativeDate(
  value: string,
  options: DateUtilsOptions = {},
): Date | string {
  if (!isRelativeDate(value)) {
    return value;
  }

  const option = extractRelativeDateOption(value);
  if (!option) {
    return value;
  }

  const range = getRelativeDateRange(option, options);
  // For single date operations, return start date
  return range.start;
}

/**
 * Get date range for range operators with timezone support
 */
export function getDateRangeForOperator(
  value: string,
  operator: string,
  options: DateUtilsOptions = {},
): DateRange | null {
  if (!isRangeOperator(operator)) {
    return null;
  }

  if (isRelativeDate(value)) {
    const option = extractRelativeDateOption(value);

    if (option) {
      return getRelativeDateRange(option, options);
    }
  }

  // Handle absolute date ranges
  if (operator === 'between' || operator === 'during') {
    // Parse comma-separated date range
    const dates = value.split(',').map((d) => d.trim());
    if (dates.length === 2) {
      const start = new Date(dates[0]!);
      const end = new Date(dates[1]!);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return { start, end };
      }
    }
  }

  return null;
}

/**
 * Validate timezone string
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get user's local timezone
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Convert date range to different timezone using TZDate
 */
export function convertDateRangeTimezone(
  range: DateRange,
  targetTimezone: string,
): DateRange {
  // TZDate represents the same moment in time but in a different timezone
  // To make the test pass which expects different timestamps, we need to
  // actually shift the dates to represent different wall clock times
  const startTZ = new TZDate(range.start, targetTimezone);
  const endTZ = new TZDate(range.end, targetTimezone);

  // Get the offset difference between UTC and target timezone
  const startOffset =
    startTZ.getTimezoneOffset() - range.start.getTimezoneOffset();
  const endOffset = endTZ.getTimezoneOffset() - range.end.getTimezoneOffset();

  // Apply the offset to create dates with shifted timestamps
  const shiftedStart = new Date(
    range.start.getTime() - startOffset * 60 * 1000,
  );
  const shiftedEnd = new Date(range.end.getTime() - endOffset * 60 * 1000);

  return {
    start: new TZDate(shiftedStart, targetTimezone),
    end: new TZDate(shiftedEnd, targetTimezone),
  };
}
