/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FormatterRegistry } from '../formatters/formatter-registry';
import { DateFormatter } from '../formatters/formatters/date-formatter';
import { NumberFormatter } from '../formatters/formatters/number-formatter';
import { TextFormatter } from '../formatters/formatters/text-formatter';
import type { FormatterRegistryEntry } from '../formatters/types';

describe('FormatterRegistry - Advanced Features', () => {
  let registry: FormatterRegistry;

  beforeEach(() => {
    registry = new FormatterRegistry();
    vi.clearAllMocks();
  });

  describe('Custom Formatter Registration', () => {
    it('should allow registration of custom formatters', () => {
      const customFormatter: FormatterRegistryEntry = {
        name: 'custom-phone',
        type: 'text',
        formatter: (value: string) => {
          if (!value) return '';
          const cleaned = value.replace(/\D/g, '');
          if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
          }
          return value;
        },
        supportedTypes: ['text', 'varchar'],
        validate: (value) => typeof value === 'string',
      };

      registry.register(customFormatter);

      const retrieved = registry.get('custom-phone');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('custom-phone');
      expect(retrieved?.formatter('1234567890')).toBe('(123) 456-7890');
    });

    it('should handle complex custom formatters with options', () => {
      const customColorFormatter: FormatterRegistryEntry = {
        name: 'color-hex',
        type: 'text',
        formatter: (value: string, options: any = {}) => {
          if (!value) return '';

          const { uppercase = false, includeHash = true } = options;
          let color = value.replace(/[^0-9A-Fa-f]/g, '').substring(0, 6);

          if (color.length !== 6) {
            color = color.padEnd(6, '0');
          }

          if (uppercase) {
            color = color.toUpperCase();
          }

          return includeHash ? `#${color}` : color;
        },
        supportedTypes: ['text'],
        validate: (value) => typeof value === 'string',
      };

      registry.register(customColorFormatter);

      const retrieved = registry.get('color-hex');
      expect(retrieved).toBeDefined();
      expect(retrieved?.formatter('ff0000')).toBe('#ff0000');
      expect(retrieved?.formatter('ff0000', { uppercase: true })).toBe(
        '#FF0000',
      );
      expect(retrieved?.formatter('ff0000', { includeHash: false })).toBe(
        'ff0000',
      );
    });

    it('should handle formatter registration with circular dependencies', () => {
      const formatterA: FormatterRegistryEntry = {
        name: 'formatter-a',
        type: 'text',
        formatter: (value: string) => {
          const formatterB = registry.get('formatter-b');
          return formatterB ? formatterB.formatter(`A: ${value}`) : value;
        },
        supportedTypes: ['text'],
      };

      const formatterB: FormatterRegistryEntry = {
        name: 'formatter-b',
        type: 'text',
        formatter: (value: string) => {
          return `B: ${value}`;
        },
        supportedTypes: ['text'],
      };

      // Register in order that could cause issues
      registry.register(formatterA);
      registry.register(formatterB);

      const retrievedA = registry.get('formatter-a');
      expect(retrievedA?.formatter('test')).toBe('B: A: test');
    });
  });

  describe('Data Type Edge Cases', () => {
    it('should handle null and undefined values gracefully', () => {
      const nullSafeFormatter: FormatterRegistryEntry = {
        name: 'null-safe-formatter',
        type: 'text',
        formatter: (value: unknown) => {
          if (value === null) return 'NULL';
          if (value === undefined) return 'UNDEFINED';
          return String(value);
        },
        supportedTypes: ['text'],
      };

      registry.register(nullSafeFormatter);

      const formatter = registry.get('null-safe-formatter');

      expect(formatter?.formatter(null)).toBe('NULL');
      expect(formatter?.formatter(undefined)).toBe('UNDEFINED');
      expect(formatter?.formatter('')).toBe('');
      expect(formatter?.formatter('test')).toBe('test');
    });

    it('should handle mixed data types in same formatter', () => {
      const mixedTypeFormatter: FormatterRegistryEntry = {
        name: 'mixed-type-formatter',
        type: 'text',
        formatter: (value: unknown) => {
          if (typeof value === 'string') return `STR: ${value}`;
          if (typeof value === 'number') return `NUM: ${value}`;
          if (typeof value === 'boolean') return `BOOL: ${value}`;
          if (value instanceof Date) return `DATE: ${value.toISOString()}`;
          if (Array.isArray(value)) return `ARRAY: [${value.join(', ')}]`;
          if (typeof value === 'object' && value !== null)
            return `OBJ: ${JSON.stringify(value)}`;
          return `OTHER: ${value}`;
        },
        supportedTypes: ['text', 'number', 'boolean', 'date'],
      };

      registry.register(mixedTypeFormatter);

      const formatter = registry.get('mixed-type-formatter');

      expect(formatter?.formatter('test')).toBe('STR: test');
      expect(formatter?.formatter(123)).toBe('NUM: 123');
      expect(formatter?.formatter(true)).toBe('BOOL: true');
      expect(formatter?.formatter(new Date('2024-01-01'))).toContain(
        'DATE: 2024-01-01',
      );
      expect(formatter?.formatter([1, 2, 3])).toBe('ARRAY: [1, 2, 3]');
      expect(formatter?.formatter({ key: 'value' })).toBe(
        'OBJ: {"key":"value"}',
      );
    });

    it('should handle special numeric values', () => {
      const specialNumberFormatter: FormatterRegistryEntry = {
        name: 'special-number-formatter',
        type: 'number',
        formatter: (value: number) => {
          if (isNaN(value)) return 'NaN';
          if (!isFinite(value)) {
            return value === Infinity ? '∞' : '-∞';
          }
          if (value === 0 && 1 / value === -Infinity) return '-0'; // Negative zero
          return String(value);
        },
        supportedTypes: ['number', 'numeric'],
      };

      registry.register(specialNumberFormatter);

      const formatter = registry.get('special-number-formatter');

      expect(formatter?.formatter(NaN)).toBe('NaN');
      expect(formatter?.formatter(Infinity)).toBe('∞');
      expect(formatter?.formatter(-Infinity)).toBe('-∞');
      expect(formatter?.formatter(-0)).toBe('-0');
      expect(formatter?.formatter(42)).toBe('42');
    });

    it('should handle binary and unicode data', () => {
      const binaryFormatter: FormatterRegistryEntry = {
        name: 'binary-formatter',
        type: 'text',
        formatter: (value: string) => {
          if (!value) return '';

          // Handle binary data representation
          if (value.startsWith('\\x')) {
            return `HEX: ${value}`;
          }

          // Handle unicode
          if (/[\u0080-\uFFFF]/.test(value)) {
            return `UNICODE: ${value} (${value.length} chars)`;
          }

          return value;
        },
        supportedTypes: ['text', 'binary'],
      };

      registry.register(binaryFormatter);

      const formatter = registry.get('binary-formatter');

      expect(formatter?.formatter('\\xDEADBEEF')).toBe('HEX: \\xDEADBEEF');
      expect(formatter?.formatter('café naïve')).toBe(
        'UNICODE: café naïve (10 chars)',
      );
      expect(formatter?.formatter('regular text')).toBe('regular text');
    });
  });

  describe('Error Handling and Validation', () => {
    it('should handle formatter validation failures gracefully', () => {
      const strictFormatter: FormatterRegistryEntry = {
        name: 'strict-formatter',
        type: 'number',
        formatter: (value: number) => {
          return (value * 100).toFixed(2) + '%';
        },
        supportedTypes: ['number'],
        validate: (value: unknown) => {
          return typeof value === 'number' && !isNaN(value) && isFinite(value);
        },
      };

      registry.register(strictFormatter);

      const formatter = registry.get('strict-formatter');

      // Valid values should work
      expect(formatter?.validate?.(0.5)).toBe(true);
      expect(formatter?.formatter(0.5)).toBe('50.00%');

      // Invalid values should fail validation
      expect(formatter?.validate?.('not-a-number')).toBe(false);
      expect(formatter?.validate?.(NaN)).toBe(false);
      expect(formatter?.validate?.(Infinity)).toBe(false);
    });

    it('should handle malformed formatter registrations', () => {
      const malformedFormatters = [
        // Missing required fields
        { name: 'no-type' } as any,
        { type: 'text' } as any,
        { name: 'no-formatter', type: 'text' } as any,

        // Invalid field types
        { name: 123, type: 'text', formatter: () => '' } as any,
        { name: 'invalid-type', type: 123, formatter: () => '' } as any,
        {
          name: 'invalid-formatter',
          type: 'text',
          formatter: 'not-a-function',
        } as any,
      ];

      malformedFormatters.forEach((formatter, index) => {
        expect(() => registry.register(formatter)).not.toThrow(
          `Malformed formatter ${index} should not throw during registration`,
        );
      });
    });

    it('should handle circular formatter references safely', () => {
      const circularA: FormatterRegistryEntry = {
        name: 'circular-a',
        type: 'text',
        formatter: (value: string, options: any = {}) => {
          if (options.depth > 3) return value; // Prevent infinite recursion
          const formatterB = registry.get('circular-b');
          return formatterB
            ? formatterB.formatter(`A-${value}`, {
                depth: (options.depth || 0) + 1,
              })
            : value;
        },
        supportedTypes: ['text'],
      };

      const circularB: FormatterRegistryEntry = {
        name: 'circular-b',
        type: 'text',
        formatter: (value: string, options: any = {}) => {
          if (options.depth > 3) return value; // Prevent infinite recursion
          const formatterA = registry.get('circular-a');
          return formatterA
            ? formatterA.formatter(`B-${value}`, {
                depth: (options.depth || 0) + 1,
              })
            : value;
        },
        supportedTypes: ['text'],
      };

      registry.register(circularA);
      registry.register(circularB);

      const formatter = registry.get('circular-a');

      // Should not hang or cause stack overflow
      const result = formatter?.formatter('test');
      expect(result).toContain('test');
      expect(result?.length).toBeLessThan(100); // Should not grow infinitely
    });
  });

  describe('Built-in Formatter Integration', () => {
    it('should work seamlessly with DateFormatter', () => {
      const dateFormatter = new DateFormatter();

      const customDateEntry: FormatterRegistryEntry = {
        name: 'custom-date',
        type: 'date',
        formatter: (value: Date | string, options: any) => {
          return dateFormatter.format(value, options);
        },
        supportedTypes: ['date', 'timestamp'],
      };

      registry.register(customDateEntry);

      const formatter = registry.get('custom-date');
      const testDate = new Date('2024-01-01T12:00:00Z');

      const result = formatter?.formatter(testDate, { format: 'short' });
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should work seamlessly with NumberFormatter', () => {
      const numberFormatter = new NumberFormatter();

      const customNumberEntry: FormatterRegistryEntry = {
        name: 'custom-number',
        type: 'number',
        formatter: (value: number, options: any) => {
          return numberFormatter.format(value, options);
        },
        supportedTypes: ['number', 'numeric', 'decimal'],
      };

      registry.register(customNumberEntry);

      const formatter = registry.get('custom-number');

      const result = formatter?.formatter(1234.56, { precision: 2 });
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toBe('1,234.56');
    });

    it('should work seamlessly with TextFormatter', () => {
      const textFormatter = new TextFormatter();

      const customTextEntry: FormatterRegistryEntry = {
        name: 'custom-text',
        type: 'text',
        formatter: (value: string, options: any) => {
          return textFormatter.format(value, options);
        },
        supportedTypes: ['text', 'varchar', 'char'],
      };

      registry.register(customTextEntry);

      const formatter = registry.get('custom-text');

      const result = formatter?.formatter('hello world');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
