import { tz } from '@date-fns/tz';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

import type { DateFormatterConfig } from '../types';

/**
 * Date formatter with timezone support and various date formats
 * Uses date-fns for formatting with Intl.DateTimeFormat for timezone handling
 */
export class DateFormatter {
  private dateFormatters = new Map<string, Intl.DateTimeFormat>();
  private relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

  /**
   * Format a date value according to the configuration
   */
  format(value: unknown, config?: DateFormatterConfig): string {
    // Handle null/undefined
    if (value == null) {
      return '—';
    }

    // Convert to Date
    const dateValue = this.toDate(value);
    if (!dateValue || !isValid(dateValue)) {
      return '—';
    }

    // Get default config
    const formatterConfig: DateFormatterConfig = {
      type: 'date',
      locale: 'en-US',
      timezone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
      ...config,
    };

    // Apply timezone if specified
    const finalDate = dateValue;

    // Format based on type
    switch (formatterConfig.type) {
      case 'relative':
        return this.formatRelative(finalDate, formatterConfig);

      case 'custom':
        return this.formatCustom(finalDate, formatterConfig);

      case 'time':
        return this.formatTime(finalDate, formatterConfig);

      case 'datetime':
        return this.formatDateTime(finalDate, formatterConfig);

      case 'date':
      default:
        return this.formatDate(finalDate, formatterConfig);
    }
  }

  /**
   * Format as date only
   */
  formatDate(date: Date, config: DateFormatterConfig): string {
    const timezone = config.timezone || 'UTC';
    const key = `date-${config.locale}-${config.dateStyle}-${timezone}`;
    let formatter = this.dateFormatters.get(key);

    if (!formatter) {
      formatter = new Intl.DateTimeFormat(config.locale, {
        dateStyle: config.dateStyle,
        timeZone: timezone,
      });
      this.dateFormatters.set(key, formatter);
    }

    return formatter.format(date);
  }

  /**
   * Format as time only
   */
  formatTime(date: Date, config: DateFormatterConfig): string {
    const timezone = config.timezone || 'UTC';
    const key = `time-${config.locale}-${config.timeStyle}-${timezone}`;
    let formatter = this.dateFormatters.get(key);

    if (!formatter) {
      formatter = new Intl.DateTimeFormat(config.locale, {
        timeStyle: config.timeStyle,
        timeZone: timezone,
      });
      this.dateFormatters.set(key, formatter);
    }

    return formatter.format(date);
  }

  /**
   * Format as date and time
   */
  formatDateTime(date: Date, config: DateFormatterConfig): string {
    const timezone = config.timezone || 'UTC';
    const key = `datetime-${config.locale}-${config.dateStyle}-${config.timeStyle}-${timezone}`;
    let formatter = this.dateFormatters.get(key);

    if (!formatter) {
      formatter = new Intl.DateTimeFormat(config.locale, {
        dateStyle: config.dateStyle,
        timeStyle: config.timeStyle,
        timeZone: timezone,
      });
      this.dateFormatters.set(key, formatter);
    }

    return formatter.format(date);
  }

  /**
   * Format with custom format string using date-fns
   */
  formatCustom(date: Date, config: DateFormatterConfig): string {
    const formatString = config.format || 'MMM dd, yyyy';
    const timezone = config.timezone || 'UTC';

    try {
      // Create timezone-aware date and format it
      const tzDate = tz(timezone)(date);
      return format(tzDate, formatString);
    } catch {
      // Fallback to default format
      return this.formatDate(date, { ...config, dateStyle: 'medium' });
    }
  }

  /**
   * Format as relative time (e.g., "2 hours ago", "in 3 days")
   */
  formatRelative(date: Date, config: DateFormatterConfig): string {
    try {
      // Use date-fns for relative formatting as it's more flexible
      return formatDistanceToNow(date, {
        addSuffix: true,
      });
    } catch {
      // Fallback to absolute date
      return this.formatDate(date, { ...config, dateStyle: 'medium' });
    }
  }

  /**
   * Format date for specific use cases
   */
  formatShort(date: Date, locale = 'en-US', timezone?: string): string {
    return this.format(date, {
      type: 'date',
      locale,
      timezone,
      dateStyle: 'short',
    });
  }

  formatLong(date: Date, locale = 'en-US', timezone?: string): string {
    return this.format(date, {
      type: 'datetime',
      locale,
      timezone,
      dateStyle: 'long',
      timeStyle: 'short',
    });
  }

  formatISO(date: Date): string {
    return date.toISOString();
  }

  /**
   * Convert various input types to Date
   */
  private toDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string') {
      // Handle empty strings
      if (value.trim() === '') {
        return null;
      }

      // Try parsing ISO string
      try {
        const parsed = parseISO(value);
        if (isValid(parsed)) {
          return parsed;
        }
      } catch {
        // Ignore parsing error
      }

      // Try parsing as regular Date
      try {
        const parsed = new Date(value);
        if (isValid(parsed)) {
          return parsed;
        }
      } catch {
        // Ignore parsing error
      }

      return null;
    }

    if (typeof value === 'number') {
      // Handle timestamp (both seconds and milliseconds)
      const timestamp = value < 10000000000 ? value * 1000 : value;
      const date = new Date(timestamp);
      return isValid(date) ? date : null;
    }

    return null;
  }

  /**
   * Clear cached formatters
   */
  clearCache(): void {
    this.dateFormatters.clear();
    this.relativeFormatters.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    dateFormatters: number;
    relativeFormatters: number;
    keys: string[];
  } {
    return {
      dateFormatters: this.dateFormatters.size,
      relativeFormatters: this.relativeFormatters.size,
      keys: [
        ...Array.from(this.dateFormatters.keys()),
        ...Array.from(this.relativeFormatters.keys()),
      ],
    };
  }
}
