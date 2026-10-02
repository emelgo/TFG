import { beforeEach, describe, expect, it } from 'vitest';

import { FormatterRegistry } from '../formatter-registry';
import type { FormatterRegistryEntry } from '../types';

describe('FormatterRegistry', () => {
  let registry: FormatterRegistry;

  beforeEach(() => {
    registry = new FormatterRegistry();
  });

  describe('register and get', () => {
    it('should register and retrieve a formatter', () => {
      const formatter: FormatterRegistryEntry = {
        name: 'test-formatter',
        type: 'text',
        formatter: (value: unknown) => String(value),
        supportedTypes: ['text', 'varchar'],
      };

      registry.register(formatter);

      const retrieved = registry.get('test-formatter');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test-formatter');
      expect(retrieved?.type).toBe('text');
    });

    it('should return undefined for non-existent formatters', () => {
      const result = registry.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should overwrite existing formatters with same name', () => {
      const formatter1: FormatterRegistryEntry = {
        name: 'test',
        type: 'text',
        formatter: () => 'first',
      };

      const formatter2: FormatterRegistryEntry = {
        name: 'test',
        type: 'number',
        formatter: () => 'second',
      };

      registry.register(formatter1);
      registry.register(formatter2);

      const result = registry.get('test');
      expect(result?.type).toBe('number');
      expect(result?.formatter(null)).toBe('second');
    });
  });

  describe('getAll', () => {
    it('should return empty array when no formatters registered', () => {
      const result = registry.getAll();
      expect(result).toEqual([]);
    });

    it('should return all registered formatters', () => {
      const formatter1: FormatterRegistryEntry = {
        name: 'formatter1',
        type: 'text',
        formatter: () => 'text',
      };

      const formatter2: FormatterRegistryEntry = {
        name: 'formatter2',
        type: 'number',
        formatter: () => 'number',
      };

      registry.register(formatter1);
      registry.register(formatter2);

      const result = registry.getAll();
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.name)).toContain('formatter1');
      expect(result.map((f) => f.name)).toContain('formatter2');
    });
  });

  describe('getFormattersForDataType', () => {
    beforeEach(() => {
      const textFormatter: FormatterRegistryEntry = {
        name: 'text-formatter',
        type: 'text',
        formatter: () => 'text',
        supportedTypes: ['text', 'varchar', 'char'],
      };

      const numberFormatter: FormatterRegistryEntry = {
        name: 'number-formatter',
        type: 'number',
        formatter: () => 'number',
        supportedTypes: ['integer', 'decimal', 'numeric'],
      };

      const mixedFormatter: FormatterRegistryEntry = {
        name: 'mixed-formatter',
        type: 'text',
        formatter: () => 'mixed',
        supportedTypes: ['text', 'integer'],
      };

      registry.register(textFormatter);
      registry.register(numberFormatter);
      registry.register(mixedFormatter);
    });

    it('should return formatters for specific data type', () => {
      const textFormatters = registry.getFormattersForDataType('text');
      expect(textFormatters).toHaveLength(2);
      expect(textFormatters.map((f) => f.name)).toContain('text-formatter');
      expect(textFormatters.map((f) => f.name)).toContain('mixed-formatter');
    });

    it('should handle case-insensitive data types', () => {
      const textFormatters = registry.getFormattersForDataType('TEXT');
      expect(textFormatters).toHaveLength(2);
    });

    it('should return empty array for unsupported data types', () => {
      const result = registry.getFormattersForDataType('unsupported');
      expect(result).toEqual([]);
    });

    it('should return formatters that support multiple types', () => {
      const integerFormatters = registry.getFormattersForDataType('integer');
      expect(integerFormatters).toHaveLength(2);
      expect(integerFormatters.map((f) => f.name)).toContain(
        'number-formatter',
      );
      expect(integerFormatters.map((f) => f.name)).toContain('mixed-formatter');
    });
  });

  describe('getAvailableFormatters', () => {
    beforeEach(() => {
      const formatters: FormatterRegistryEntry[] = [
        {
          name: 'text-formatter',
          type: 'text',
          formatter: () => 'text',
          supportedTypes: ['text', 'varchar'],
        },
        {
          name: 'number-formatter',
          type: 'number',
          formatter: () => 'number',
          supportedTypes: ['integer', 'decimal'],
        },
      ];

      formatters.forEach((f) => registry.register(f));
    });

    it('should return all formatters when no data type specified', () => {
      const result = registry.getAvailableFormatters();
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ name: 'text-formatter', type: 'text' });
      expect(result).toContainEqual({
        name: 'number-formatter',
        type: 'number',
      });
    });

    it('should return formatters for specific data type', () => {
      const result = registry.getAvailableFormatters('text');
      expect(result).toHaveLength(1);
      expect(result).toContainEqual({ name: 'text-formatter', type: 'text' });
    });

    it('should return empty array for unsupported data type', () => {
      const result = registry.getAvailableFormatters('unsupported');
      expect(result).toEqual([]);
    });
  });

  describe('has', () => {
    it('should return true for registered formatters', () => {
      const formatter: FormatterRegistryEntry = {
        name: 'test-formatter',
        type: 'text',
        formatter: () => 'test',
      };

      registry.register(formatter);
      expect(registry.has('test-formatter')).toBe(true);
    });

    it('should return false for non-existent formatters', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('unregister', () => {
    beforeEach(() => {
      const formatter: FormatterRegistryEntry = {
        name: 'test-formatter',
        type: 'text',
        formatter: () => 'test',
        supportedTypes: ['text', 'varchar'],
      };

      registry.register(formatter);
    });

    it('should remove formatter and return true', () => {
      expect(registry.has('test-formatter')).toBe(true);

      const result = registry.unregister('test-formatter');
      expect(result).toBe(true);
      expect(registry.has('test-formatter')).toBe(false);
    });

    it('should return false for non-existent formatters', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });

    it('should remove from type mappings', () => {
      expect(registry.getFormattersForDataType('text')).toHaveLength(1);

      registry.unregister('test-formatter');
      expect(registry.getFormattersForDataType('text')).toHaveLength(0);
    });

    it('should clean up empty type mappings', () => {
      registry.unregister('test-formatter');

      // Add another formatter with different types
      const newFormatter: FormatterRegistryEntry = {
        name: 'new-formatter',
        type: 'number',
        formatter: () => 'new',
        supportedTypes: ['integer'],
      };

      registry.register(newFormatter);

      // Text type should be completely removed
      expect(registry.getFormattersForDataType('text')).toHaveLength(0);
      expect(registry.getFormattersForDataType('integer')).toHaveLength(1);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      const formatters: FormatterRegistryEntry[] = [
        {
          name: 'formatter1',
          type: 'text',
          formatter: () => 'text',
          supportedTypes: ['text'],
        },
        {
          name: 'formatter2',
          type: 'number',
          formatter: () => 'number',
          supportedTypes: ['integer'],
        },
      ];

      formatters.forEach((f) => registry.register(f));
    });

    it('should remove all formatters', () => {
      expect(registry.getAll()).toHaveLength(2);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
      expect(registry.getFormattersForDataType('text')).toHaveLength(0);
      expect(registry.getFormattersForDataType('integer')).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return correct stats for empty registry', () => {
      const stats = registry.getStats();

      expect(stats.totalFormatters).toBe(0);
      expect(stats.supportedDataTypes).toBe(0);
      expect(stats.formattersByType).toEqual({});
    });

    it('should return correct stats for populated registry', () => {
      const formatters: FormatterRegistryEntry[] = [
        {
          name: 'text-formatter-1',
          type: 'text',
          formatter: () => 'text1',
          supportedTypes: ['text', 'varchar'],
        },
        {
          name: 'text-formatter-2',
          type: 'text',
          formatter: () => 'text2',
          supportedTypes: ['char'],
        },
        {
          name: 'number-formatter',
          type: 'number',
          formatter: () => 'number',
          supportedTypes: ['integer', 'decimal'],
        },
      ];

      formatters.forEach((f) => registry.register(f));

      const stats = registry.getStats();

      expect(stats.totalFormatters).toBe(3);
      expect(stats.supportedDataTypes).toBe(5); // text, varchar, char, integer, decimal
      expect(stats.formattersByType).toEqual({
        text: 2,
        number: 1,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle formatters without supported types', () => {
      const formatter: FormatterRegistryEntry = {
        name: 'simple-formatter',
        type: 'custom',
        formatter: () => 'simple',
      };

      registry.register(formatter);

      expect(registry.has('simple-formatter')).toBe(true);
      expect(registry.getFormattersForDataType('any')).toHaveLength(0);
      expect(registry.getAll()).toHaveLength(1);
    });

    it('should handle formatters with empty supported types array', () => {
      const formatter: FormatterRegistryEntry = {
        name: 'empty-types-formatter',
        type: 'custom',
        formatter: () => 'empty',
        supportedTypes: [],
      };

      registry.register(formatter);

      expect(registry.has('empty-types-formatter')).toBe(true);
      expect(registry.getAll()).toHaveLength(1);
    });
  });
});
