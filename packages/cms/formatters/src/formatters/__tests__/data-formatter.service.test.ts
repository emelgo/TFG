import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_FORMATTER_CONTEXT,
  DataFormatterService,
} from '../data-formatter.service';
import type {
  FormatterConfig,
  FormatterContext,
  FormatterFunction,
} from '../types';

describe('DataFormatterService', () => {
  let service: DataFormatterService;
  let context: FormatterContext;

  beforeEach(() => {
    context = { ...DEFAULT_FORMATTER_CONTEXT };
    service = new DataFormatterService(context);
  });

  describe('initialization', () => {
    it('should initialize with built-in formatters', () => {
      const availableFormatters = service.getAvailableFormatters();

      expect(availableFormatters.length).toBeGreaterThan(0);
      expect(availableFormatters.map((f) => f.name)).toContain('number');
      expect(availableFormatters.map((f) => f.name)).toContain('date');
      expect(availableFormatters.map((f) => f.name)).toContain('text');
      expect(availableFormatters.map((f) => f.name)).toContain('boolean');
    });

    it('should use provided context', () => {
      const customContext: FormatterContext = {
        locale: 'fr-FR',
        timezone: 'Europe/Paris',
        currency: 'EUR',
      };

      const customService = new DataFormatterService(customContext);
      expect(customService.getContext()).toEqual(customContext);
    });
  });

  describe('format', () => {
    it('should handle null and undefined values', () => {
      const result = service.format(null, { type: 'text' });
      expect(result.formatted).toBe('—');
      expect(result.raw).toBeNull();
      expect(result.error).toBeUndefined();
    });

    it('should format text values', () => {
      const result = service.format('Hello World', { type: 'text' });
      expect(result.formatted).toBe('Hello World');
      expect(result.raw).toBe('Hello World');
      expect(result.error).toBeUndefined();
    });

    it('should format number values', () => {
      const result = service.format(1234.56, { type: 'number' });
      expect(result.formatted).toBeTruthy();
      expect(result.raw).toBe(1234.56);
      expect(result.error).toBeUndefined();
    });

    it('should format date values', () => {
      const date = new Date('2023-12-25T15:30:00Z');
      const result = service.format(date, { type: 'date' });
      expect(result.formatted).toBeTruthy();
      expect(result.raw).toBe(date);
      expect(result.error).toBeUndefined();
    });

    it('should format boolean values', () => {
      const trueResult = service.format(true, { type: 'boolean' });
      const falseResult = service.format(false, { type: 'boolean' });

      expect(trueResult.formatted).toBe('Yes');
      expect(falseResult.formatted).toBe('No');
      expect(trueResult.error).toBeUndefined();
      expect(falseResult.error).toBeUndefined();
    });

    it('should handle unknown formatter types', () => {
      const result = service.format('test', {
        type: 'unknown-type',
      } as FormatterConfig);
      expect(result.formatted).toBe('test');
      expect(result.error).toContain('unknown-type');
    });

    it('should merge context with config', () => {
      const customContext: FormatterContext = {
        locale: 'de-DE',
        timezone: 'Europe/Berlin',
        currency: 'EUR',
      };

      const customService = new DataFormatterService(customContext);
      const result = customService.format(1234.56, { type: 'number' });

      expect(result.config.locale).toBe('de-DE');
      expect(result.config.timezone).toBe('Europe/Berlin');
    });

    it('should handle formatter errors gracefully', () => {
      // Register a formatter that throws an error
      const errorFormatter: FormatterFunction = () => {
        throw new Error('Test error');
      };

      service.registerFormatter('error-formatter', 'text', errorFormatter);

      const result = service.format('test', {
        type: 'error-formatter',
      } as FormatterConfig);
      expect(result.formatted).toBe('test'); // Fallback to string conversion
      expect(result.error).toContain('Formatting operation failed');
    });
  });

  describe('formatBatch', () => {
    it('should format multiple values', () => {
      const items = [
        { value: 'Hello' as unknown, config: { type: 'text' as const } },
        { value: 123 as unknown, config: { type: 'number' as const } },
        { value: true as unknown, config: { type: 'boolean' as const } },
      ];

      const results = service.formatBatch(items);

      expect(results).toHaveLength(3);
      expect(results[0]?.formatted).toBe('Hello');
      expect(results[1]?.formatted).toBeTruthy();
      expect(results[2]?.formatted).toBe('Yes');
    });

    it('should handle empty batch', () => {
      const results = service.formatBatch([]);
      expect(results).toEqual([]);
    });
  });

  describe('formatByColumn', () => {
    it('should format by column with explicit type', () => {
      const columnConfig = {
        columnName: 'test_column',
        dataType: 'text',
        type: 'text' as const,
        locale: 'en-US',
      };

      const result = service.formatByColumn('Hello World', columnConfig);
      expect(result.formatted).toBe('Hello World');
      expect(result.config.type).toBe('text');
      expect(result.config.locale).toBe('en-US');
    });

    it('should infer config from data type', () => {
      const columnConfig = {
        columnName: 'price',
        dataType: 'decimal',
        scale: 2,
      };

      const result = service.formatByColumn(123.456, columnConfig);
      expect(result.config.type).toBe('number');
      expect(
        'maximumFractionDigits' in result.config &&
          result.config.maximumFractionDigits,
      ).toBe(2);
    });
  });

  describe('inferConfigFromColumn', () => {
    it('should return explicit config when provided', () => {
      const columnConfig = {
        columnName: 'test',
        type: 'text' as const,
        locale: 'fr-FR',
        timezone: 'Europe/Paris',
      };

      const config = service.inferConfigFromColumn(columnConfig);
      expect(config.type).toBe('text');
      expect(config.locale).toBe('fr-FR');
      expect(config.timezone).toBe('Europe/Paris');
    });

    it('should infer number config from numeric types', () => {
      const testCases = [
        'integer',
        'bigint',
        'decimal',
        'numeric',
        'real',
        'double precision',
        'smallint',
      ];

      testCases.forEach((dataType) => {
        const config = service.inferConfigFromColumn({
          columnName: 'test',
          dataType,
          scale: 3,
        });

        expect(config.type).toBe('number');
        expect(
          'maximumFractionDigits' in config && config.maximumFractionDigits,
        ).toBe(3);
      });
    });

    it('should infer date config from date types', () => {
      const testCases = [
        { dataType: 'date', expectedType: 'date' },
        { dataType: 'timestamp', expectedType: 'datetime' },
        { dataType: 'timestamptz', expectedType: 'datetime' },
      ];

      testCases.forEach(({ dataType, expectedType }) => {
        const config = service.inferConfigFromColumn({
          columnName: 'test',
          dataType,
        });

        expect(config.type).toBe(expectedType);
      });
    });

    it('should infer boolean config from boolean types', () => {
      const testCases = ['boolean', 'bool'];

      testCases.forEach((dataType) => {
        const config = service.inferConfigFromColumn({
          columnName: 'test',
          dataType,
        });

        expect(config.type).toBe('boolean');
      });
    });

    it('should default to text config for unknown types', () => {
      const config = service.inferConfigFromColumn({
        columnName: 'test',
        dataType: 'unknown-type',
      });

      expect(config.type).toBe('text');
    });

    it('should default to text config when no dataType provided', () => {
      const config = service.inferConfigFromColumn({
        columnName: 'test',
      });

      expect(config.type).toBe('text');
    });
  });

  describe('context management', () => {
    it('should update context', () => {
      const originalContext = service.getContext();
      expect(originalContext.locale).toBe('en-US');

      service.updateContext({ locale: 'fr-FR', currency: 'EUR' });

      const updatedContext = service.getContext();
      expect(updatedContext.locale).toBe('fr-FR');
      expect(updatedContext.currency).toBe('EUR');
      expect(updatedContext.timezone).toBe('UTC'); // Should preserve unchanged values
    });

    it('should return a copy of context', () => {
      const context1 = service.getContext();
      const context2 = service.getContext();

      expect(context1).toEqual(context2);
      expect(context1).not.toBe(context2); // Different objects
    });
  });

  describe('custom formatters', () => {
    it('should register and use custom formatter', () => {
      const customFormatter: FormatterFunction = (value: unknown) =>
        `CUSTOM: ${value}`;

      service.registerFormatter('custom-test', 'text', customFormatter, [
        'custom',
      ]);

      const result = service.format('test value', {
        type: 'custom-test',
      } as FormatterConfig);
      expect(result.formatted).toBe('CUSTOM: test value');

      const availableFormatters = service.getAvailableFormatters('custom');
      expect(availableFormatters).toContainEqual({
        name: 'custom-test',
        type: 'text',
      });
    });

    it('should override built-in formatters', () => {
      const overrideFormatter: FormatterFunction = () => 'OVERRIDDEN';

      service.registerFormatter('text', 'text', overrideFormatter);

      const result = service.format('original text', { type: 'text' });
      expect(result.formatted).toBe('OVERRIDDEN');
    });
  });

  describe('getAvailableFormatters', () => {
    it('should return all formatters when no data type specified', () => {
      const formatters = service.getAvailableFormatters();
      expect(formatters.length).toBeGreaterThan(0);

      const names = formatters.map((f) => f.name);
      expect(names).toContain('number');
      expect(names).toContain('date');
      expect(names).toContain('text');
      expect(names).toContain('boolean');
    });

    it('should return formatters for specific data type', () => {
      const numberFormatters = service.getAvailableFormatters('integer');
      expect(numberFormatters.length).toBeGreaterThan(0);

      const textFormatters = service.getAvailableFormatters('text');
      expect(textFormatters.length).toBeGreaterThan(0);
    });

    it('should return empty array for unsupported data type', () => {
      const formatters = service.getAvailableFormatters('unsupported-type');
      expect(formatters).toEqual([]);
    });
  });

  describe('built-in boolean formatter', () => {
    it('should format with custom labels', () => {
      const config = {
        type: 'boolean' as const,
        trueLabel: 'Active',
        falseLabel: 'Inactive',
        nullLabel: 'Unknown',
      };

      expect(service.format(true, config).formatted).toBe('Active');
      expect(service.format(false, config).formatted).toBe('Inactive');
      expect(service.format(null, config).formatted).toBe('—'); // The service handles null values before the formatter
    });

    it('should handle truthy and falsy values', () => {
      expect(service.format(1, { type: 'boolean' }).formatted).toBe('Yes');
      expect(service.format(0, { type: 'boolean' }).formatted).toBe('No');
      expect(service.format('', { type: 'boolean' }).formatted).toBe('No');
      expect(service.format('text', { type: 'boolean' }).formatted).toBe('Yes');
    });
  });

  describe('edge cases', () => {
    it('should handle complex objects', () => {
      const obj = { nested: { value: 'test' } };
      const result = service.format(obj, { type: 'text' });
      expect(result.formatted).toBe('[object Object]');
    });

    it('should handle arrays', () => {
      const arr = [1, 2, 3];
      const result = service.format(arr, { type: 'text' });
      expect(result.formatted).toBe('1,2,3');
    });

    it('should handle symbol values', () => {
      const sym = Symbol('test');
      const result = service.format(sym, { type: 'text' });
      expect(result.formatted).toContain('Symbol(test)');
    });
  });
});
