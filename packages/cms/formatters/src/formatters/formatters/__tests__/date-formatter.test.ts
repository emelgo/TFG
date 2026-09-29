import { beforeEach, describe, expect, it } from 'vitest';

import { DateFormatter } from '../date-formatter';

describe('DateFormatter', () => {
  let formatter: DateFormatter;
  const testDate = new Date('2023-12-25T15:30:45.123Z');

  beforeEach(() => {
    formatter = new DateFormatter();
  });

  describe('format', () => {
    it('should handle null and undefined values', () => {
      expect(formatter.format(null)).toBe('—');
      expect(formatter.format(undefined)).toBe('—');
    });

    it('should handle invalid date values', () => {
      expect(formatter.format('invalid-date')).toBe('—');
      expect(formatter.format(NaN)).toBe('—');
    });

    it('should format date with default config', () => {
      const result = formatter.format(testDate);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format date only', () => {
      const result = formatter.format(testDate, {
        type: 'date',
        locale: 'en-US',
        dateStyle: 'short',
      });
      expect(result).toMatch(/^\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})$/);
    });

    it('should format time only', () => {
      const result = formatter.format(testDate, {
        type: 'time',
        locale: 'en-US',
        timeStyle: 'short',
      });
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format datetime', () => {
      const result = formatter.format(testDate, {
        type: 'datetime',
        locale: 'en-US',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format custom format', () => {
      const result = formatter.format(testDate, {
        type: 'custom',
        format: 'yyyy-MM-dd',
      });
      expect(result).toBe('2023-12-25');
    });

    it('should format relative time', () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

      const result = formatter.format(pastDate, { type: 'relative' });
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatDate', () => {
    it('should format date with different styles', () => {
      const shortResult = formatter.formatDate(testDate, {
        type: 'date',
        locale: 'en-US',
        dateStyle: 'short',
      });
      const mediumResult = formatter.formatDate(testDate, {
        type: 'date',
        locale: 'en-US',
        dateStyle: 'medium',
      });
      const longResult = formatter.formatDate(testDate, {
        type: 'date',
        locale: 'en-US',
        dateStyle: 'long',
      });

      expect(shortResult).toBeTruthy();
      expect(mediumResult).toBeTruthy();
      expect(longResult).toBeTruthy();

      // They should all be different
      expect(shortResult).not.toBe(mediumResult);
      expect(mediumResult).not.toBe(longResult);
    });
  });

  describe('formatTime', () => {
    it('should format time with different styles', () => {
      const shortResult = formatter.formatTime(testDate, {
        type: 'time',
        locale: 'en-US',
        timeStyle: 'short',
      });
      const mediumResult = formatter.formatTime(testDate, {
        type: 'time',
        locale: 'en-US',
        timeStyle: 'medium',
      });

      expect(shortResult).toBeTruthy();
      expect(mediumResult).toBeTruthy();
      expect(typeof shortResult).toBe('string');
      expect(typeof mediumResult).toBe('string');
    });
  });

  describe('formatCustom', () => {
    it('should format with custom patterns', () => {
      expect(
        formatter.formatCustom(testDate, { type: 'custom', format: 'yyyy' }),
      ).toBe('2023');
      expect(
        formatter.formatCustom(testDate, { type: 'custom', format: 'MM/dd' }),
      ).toBe('12/25');
      expect(
        formatter.formatCustom(testDate, { type: 'custom', format: 'EEEE' }),
      ).toBe('Monday');
    });

    it('should fallback to default format on invalid format string', () => {
      const result = formatter.formatCustom(testDate, {
        type: 'custom',
        format: 'invalid-format-XXXXX',
      });
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('utility methods', () => {
    it('should format short date', () => {
      const result = formatter.formatShort(testDate, 'en-US');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format long date', () => {
      const result = formatter.formatLong(testDate, 'en-US');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format ISO string', () => {
      const result = formatter.formatISO(testDate);
      expect(result).toBe('2023-12-25T15:30:45.123Z');
    });
  });

  describe('toDate conversion', () => {
    it('should convert Date objects', () => {
      const result = formatter.format(testDate);
      expect(result).toBeTruthy();
    });

    it('should convert ISO strings', () => {
      const result = formatter.format('2023-12-25T15:30:45.123Z');
      expect(result).toBeTruthy();
    });

    it('should convert timestamps (milliseconds)', () => {
      const timestamp = testDate.getTime();
      const result = formatter.format(timestamp);
      expect(result).toBeTruthy();
    });

    it('should convert timestamps (seconds)', () => {
      const timestamp = Math.floor(testDate.getTime() / 1000);
      const result = formatter.format(timestamp);
      expect(result).toBeTruthy();
    });

    it('should handle empty strings', () => {
      expect(formatter.format('')).toBe('—');
      expect(formatter.format('   ')).toBe('—');
    });

    it('should handle invalid string dates', () => {
      expect(formatter.format('not-a-date')).toBe('—');
    });
  });

  describe('caching', () => {
    it('should cache formatters', () => {
      // Format multiple times with same config
      formatter.format(testDate, {
        type: 'date',
        locale: 'en-US',
        dateStyle: 'medium',
      });
      formatter.format(testDate, {
        type: 'date',
        locale: 'en-US',
        dateStyle: 'medium',
      });

      const stats = formatter.getCacheStats();
      expect(stats.dateFormatters).toBeGreaterThan(0);
      expect(stats.keys.length).toBeGreaterThan(0);
    });

    it('should clear cache', () => {
      formatter.format(testDate, {
        type: 'date',
        locale: 'en-US',
        dateStyle: 'medium',
      });
      expect(formatter.getCacheStats().dateFormatters).toBeGreaterThan(0);

      formatter.clearCache();
      const stats = formatter.getCacheStats();
      expect(stats.dateFormatters).toBe(0);
      expect(stats.relativeFormatters).toBe(0);
    });
  });
});
