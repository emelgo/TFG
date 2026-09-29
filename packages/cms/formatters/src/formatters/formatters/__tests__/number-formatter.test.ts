import { beforeEach, describe, expect, it } from 'vitest';

import { NumberFormatter } from '../number-formatter';

describe('NumberFormatter', () => {
  let formatter: NumberFormatter;

  beforeEach(() => {
    formatter = new NumberFormatter();
  });

  describe('format', () => {
    it('should handle null and undefined values', () => {
      expect(formatter.format(null)).toBe('—');
      expect(formatter.format(undefined)).toBe('—');
    });

    it('should handle NaN values', () => {
      expect(formatter.format(NaN)).toBe('—');
      expect(formatter.format('not-a-number')).toBe('—');
    });

    it('should format number with default config', () => {
      const result = formatter.format(1234.5);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format with custom precision', () => {
      const result = formatter.format(1234.56789, {
        type: 'number',
        minimumFractionDigits: 2,
        maximumFractionDigits: 3,
      });
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should add prefix and suffix', () => {
      const result = formatter.format(100, {
        type: 'number',
        prefix: '$',
        suffix: '%',
      });
      expect(result).toContain('$');
      expect(result).toContain('%');
      expect(result).toContain('100');
    });
  });

  describe('formatPercentage', () => {
    it('should format decimal as percentage', () => {
      const result = formatter.formatPercentage(0.25);
      expect(result).toContain('25');
      expect(result).toContain('%');
    });

    it('should handle values already in percentage form', () => {
      const result = formatter.formatPercentage(25);
      expect(result).toContain('25');
      expect(result).toContain('%');
    });

    it('should handle null values', () => {
      expect(formatter.formatPercentage(null)).toBe('—');
    });

    it('should handle NaN values', () => {
      expect(formatter.formatPercentage('invalid')).toBe('—');
    });
  });

  describe('formatCurrency', () => {
    it('should format currency with default USD', () => {
      const result = formatter.formatCurrency(1234.56);
      expect(result).toContain('$');
      expect(result).toContain('1,234.56');
    });

    it('should format currency with custom currency', () => {
      const result = formatter.formatCurrency(1234.56, 'EUR');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle null values', () => {
      expect(formatter.formatCurrency(null)).toBe('—');
    });
  });

  describe('formatCompact', () => {
    it('should format large numbers compactly', () => {
      expect(formatter.formatCompact(1200)).toContain('1.2K');
      expect(formatter.formatCompact(1500000)).toContain('1.5M');
      expect(formatter.formatCompact(2800000000)).toContain('2.8B');
    });

    it('should handle small numbers', () => {
      const result = formatter.formatCompact(123);
      expect(result).toBe('123');
    });

    it('should handle null values', () => {
      expect(formatter.formatCompact(null)).toBe('—');
    });
  });

  describe('toNumber conversion', () => {
    it('should convert number values', () => {
      expect(formatter.format(123)).toBeTruthy();
      expect(formatter.format(123.456)).toBeTruthy();
      expect(formatter.format(-123)).toBeTruthy();
    });

    it('should convert string numbers', () => {
      expect(formatter.format('123')).toBeTruthy();
      expect(formatter.format('123.45')).toBeTruthy();
      expect(formatter.format('-123')).toBeTruthy();
      expect(formatter.format('$1,234.56')).toBeTruthy();
    });

    it('should convert bigint values', () => {
      expect(formatter.format(BigInt(123))).toBeTruthy();
    });

    it('should convert boolean values', () => {
      expect(formatter.format(true)).toBeTruthy();
      expect(formatter.format(false)).toBeTruthy();
    });

    it('should handle empty strings', () => {
      expect(formatter.format('')).toBe('—');
      expect(formatter.format('   ')).toBe('—');
    });
  });

  describe('number types', () => {
    it('should format decimal numbers', () => {
      const result = formatter.format(123.456, { type: 'decimal' });
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format scientific notation', () => {
      const result = formatter.format(123456789, { type: 'scientific' });
      expect(result).toBeTruthy();
      expect(result.toLowerCase()).toContain('e');
    });

    it('should format engineering notation', () => {
      const result = formatter.format(123456789, { type: 'engineering' });
      expect(result).toBeTruthy();
      expect(result.toLowerCase()).toContain('e');
    });

    it('should handle useGrouping option', () => {
      const withGrouping = formatter.format(123456, {
        type: 'number',
        useGrouping: true,
      });
      const withoutGrouping = formatter.format(123456, {
        type: 'number',
        useGrouping: false,
      });

      expect(withGrouping).not.toBe(withoutGrouping);
    });
  });

  describe('caching', () => {
    it('should cache formatters', () => {
      // Format multiple times with same config
      formatter.format(123, { type: 'number', locale: 'en-US' });
      formatter.format(456, { type: 'number', locale: 'en-US' });

      const stats = formatter.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.keys.length).toBeGreaterThan(0);
    });

    it('should clear cache', () => {
      formatter.format(123, { type: 'number', locale: 'en-US' });
      expect(formatter.getCacheStats().size).toBeGreaterThan(0);

      formatter.clearCache();
      expect(formatter.getCacheStats().size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero', () => {
      const result = formatter.format(0);
      expect(result).toBe('0');
    });

    it('should handle very large numbers', () => {
      const result = formatter.format(Number.MAX_SAFE_INTEGER);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle very small numbers', () => {
      const result = formatter.format(0.00001);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle negative numbers', () => {
      const result = formatter.format(-1234.56);
      expect(result).toContain('-');
      expect(result).toContain('1');
    });

    it('should handle Infinity', () => {
      const result = formatter.format(Infinity);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle -Infinity', () => {
      const result = formatter.format(-Infinity);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });
});
