import { beforeEach, describe, expect, it } from 'vitest';

import {
  formatValue,
  getAvailableFormatters,
  updateFormatterContext,
} from '../format-value';

describe('formatValue', () => {
  beforeEach(() => {
    // Reset context to default for each test
    updateFormatterContext({
      locale: 'en-US',
      timezone: 'UTC',
      currency: 'USD',
    });
  });

  it('should format numbers', () => {
    const result = formatValue(1234.56, { type: 'number' });
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('should format currency', () => {
    const result = formatValue(1234.56, {
      type: 'currency',
      currency: 'USD',
    });
    expect(result).toContain('$');
    expect(result).toContain('1,234.56');
  });

  it('should format percentages', () => {
    const result = formatValue(0.1234, { type: 'percentage' });
    expect(result).toContain('%');
  });

  it('should format dates', () => {
    const date = new Date('2023-12-25T15:30:00Z');
    const result = formatValue(date, { type: 'date' });
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('should format text', () => {
    const result = formatValue('Hello World', { type: 'text' });
    expect(result).toBe('Hello World');
  });

  it('should format booleans', () => {
    const trueResult = formatValue(true, { type: 'boolean' });
    const falseResult = formatValue(false, { type: 'boolean' });

    expect(trueResult).toBe('Yes');
    expect(falseResult).toBe('No');
  });

  it('should handle null values', () => {
    const result = formatValue(null, { type: 'text' });
    expect(result).toBe('—');
  });

  it('should handle unknown formatter types gracefully', () => {
    const result = formatValue('test', { type: 'unknown' } as unknown as {
      type: 'text';
    });
    expect(result).toBe('test'); // Should fall back to string conversion
  });

  it('should respect context updates', () => {
    updateFormatterContext({ currency: 'EUR' });

    const result = formatValue(1234.56, {
      type: 'currency',
      currency: 'EUR',
    });

    expect(result).toContain('€');
  });

  it('should get available formatters', () => {
    const formatters = getAvailableFormatters();
    expect(Array.isArray(formatters)).toBe(true);
    expect(formatters.length).toBeGreaterThan(0);

    const formatterNames = formatters.map((f) => f.name);
    expect(formatterNames).toContain('number');
    expect(formatterNames).toContain('text');
    expect(formatterNames).toContain('date');
  });

  it('should get formatters for specific data type', () => {
    const numberFormatters = getAvailableFormatters('integer');
    expect(Array.isArray(numberFormatters)).toBe(true);

    const textFormatters = getAvailableFormatters('text');
    expect(Array.isArray(textFormatters)).toBe(true);
  });
});
