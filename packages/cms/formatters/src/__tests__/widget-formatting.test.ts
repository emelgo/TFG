import { describe, expect, it } from 'vitest';

import { formatValue } from '../format-value';

describe('Widget Formatting', () => {
  describe('Metric Widget Formatting', () => {
    it('should format currency values', () => {
      const result = formatValue(1234.56, {
        type: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      expect(result).toContain('$');
      expect(result).toContain('1,234.56');
    });

    it('should format percentage values', () => {
      const result = formatValue(0.1234, {
        type: 'percentage',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });

      expect(result).toContain('%');
      expect(result).toContain('12');
    });

    it('should format decimal values', () => {
      const result = formatValue(1234.5678, {
        type: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      expect(result).toBe('1,234.57');
    });

    it('should format number values', () => {
      const result = formatValue(1234.5678, {
        type: 'number',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });

      expect(result).toBe('1,234.57');
    });
  });

  describe('Chart Widget Formatting', () => {
    it('should format compact numbers for Y-axis', () => {
      const result = formatValue(1234567, { type: 'compact' });
      expect(result).toMatch(/1\.\d+M/); // Should be in millions format like 1.2M or 1.23M
    });

    it('should format custom Y-axis values', () => {
      const result = formatValue(1234.56, {
        type: 'currency',
        currency: 'EUR',
      });

      expect(result).toContain('€');
    });

    it('should format date values for X-axis', () => {
      const date = new Date('2023-12-25T15:30:00Z');
      const result = formatValue(date, {
        type: 'date',
        dateStyle: 'medium',
      });

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('Table Widget Formatting', () => {
    it('should format column values with custom formatters', () => {
      const result = formatValue(1234.56, {
        type: 'currency',
        currency: 'GBP',
      });

      expect(result).toContain('£');
    });

    it('should format text values', () => {
      const result = formatValue('Hello World', {
        type: 'text',
      });

      expect(result).toBe('Hello World');
    });

    it('should format boolean values', () => {
      const trueResult = formatValue(true, { type: 'boolean' });
      const falseResult = formatValue(false, { type: 'boolean' });

      expect(trueResult).toBe('Yes');
      expect(falseResult).toBe('No');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid values gracefully', () => {
      const result = formatValue(null, { type: 'number' });
      expect(result).toBe('—');
    });

    it('should handle unknown formatter types', () => {
      const result = formatValue('test', { type: 'unknown' } as unknown as {
        type: 'text';
      });
      expect(result).toBe('test'); // Falls back to string conversion
    });

    it('should handle formatting errors gracefully', () => {
      // This should not throw
      const result = formatValue('not-a-number', {
        type: 'currency',
        currency: 'USD',
      });

      expect(typeof result).toBe('string');
    });
  });
});
