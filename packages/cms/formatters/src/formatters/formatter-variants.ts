/**
 * Formatter variants system to reduce code duplication
 */
import type {
  FormatterConfig,
  FormatterFunction,
  FormatterRegistryEntry,
  NumberFormatterConfig,
} from './types';

/**
 * Configuration for creating formatter variants
 */
interface FormatterVariantConfig<T extends FormatterConfig = FormatterConfig> {
  name: string;
  type: T['type'];
  baseFormatter: FormatterFunction<unknown, T>;
  supportedTypes: string[];
  defaultConfig?: Partial<T>;
}

/**
 * Helper class for creating and managing formatter variants
 */
export class FormatterVariantManager {
  /**
   * Create multiple variants of a base formatter
   */
  static createVariants<T extends FormatterConfig>(
    baseConfig: Omit<FormatterVariantConfig<T>, 'name' | 'type'>,
    variants: Array<{
      name: string;
      type: T['type'];
      defaultConfig?: Partial<T>;
    }>,
  ): FormatterRegistryEntry[] {
    return variants.map((variant) => ({
      name: variant.name,
      type: variant.type,
      formatter: ((value: unknown, config?: FormatterConfig) => {
        const mergedConfig = {
          ...baseConfig.defaultConfig,
          ...variant.defaultConfig,
          ...config,
          type: variant.type,
        } as T;

        return baseConfig.baseFormatter(value, mergedConfig);
      }) as FormatterFunction,
      supportedTypes: baseConfig.supportedTypes,
      defaultConfig: {
        ...baseConfig.defaultConfig,
        ...variant.defaultConfig,
      } as Partial<T>,
    }));
  }

  /**
   * Create number formatter variants (number, currency, percentage, compact)
   */
  static createNumberFormatterVariants(
    baseFormatter: FormatterFunction<unknown, NumberFormatterConfig>,
  ): FormatterRegistryEntry[] {
    const supportedTypes = [
      'integer',
      'bigint',
      'decimal',
      'numeric',
      'real',
      'double precision',
    ];

    const baseConfig = {
      baseFormatter,
      supportedTypes,
      defaultConfig: {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        useGrouping: true,
      } satisfies Partial<NumberFormatterConfig>,
    };

    return this.createVariants(baseConfig, [
      {
        name: 'number',
        type: 'number',
        defaultConfig: {
          notation: 'standard',
        } satisfies Partial<NumberFormatterConfig>,
      },
      {
        name: 'currency',
        type: 'currency',
        defaultConfig: {
          notation: 'standard',
          currency: 'USD',
          currencyDisplay: 'symbol',
        } satisfies Partial<NumberFormatterConfig>,
      },
      {
        name: 'percentage',
        type: 'percentage',
        defaultConfig: {
          notation: 'standard',
        } satisfies Partial<NumberFormatterConfig>,
      },
      {
        name: 'compact',
        type: 'compact',
        defaultConfig: {
          notation: 'compact',
          compactDisplay: 'short',
        } satisfies Partial<NumberFormatterConfig>,
      },
      {
        name: 'decimal',
        type: 'decimal',
        defaultConfig: {
          notation: 'standard',
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        } satisfies Partial<NumberFormatterConfig>,
      },
      {
        name: 'scientific',
        type: 'scientific',
        defaultConfig: {
          notation: 'scientific',
        } satisfies Partial<NumberFormatterConfig>,
      },
      {
        name: 'engineering',
        type: 'engineering',
        defaultConfig: {
          notation: 'engineering',
        } satisfies Partial<NumberFormatterConfig>,
      },
    ]);
  }

  /**
   * Register a formatter with automatic variant creation
   */
  static registerWithVariants(
    registry: { register: (entry: FormatterRegistryEntry) => void },
    variants: FormatterRegistryEntry[],
  ): void {
    variants.forEach((variant) => registry.register(variant));
  }

  /**
   * Create aliases for existing formatters (e.g., 'int' -> 'number')
   */
  static createAliases(
    registry: {
      get: (name: string) => FormatterRegistryEntry | undefined;
      register: (entry: FormatterRegistryEntry) => void;
    },
    aliases: Record<string, string>,
  ): void {
    Object.entries(aliases).forEach(([alias, originalName]) => {
      const original = registry.get(originalName);
      if (original) {
        registry.register({
          ...original,
          name: alias,
        });
      }
    });
  }
}

/**
 * Pre-defined formatter aliases for common use cases
 */
export const COMMON_FORMATTER_ALIASES = {
  // Number aliases
  int: 'number',
  integer: 'number',
  float: 'decimal',
  money: 'currency',
  percent: 'percentage',

  // Date aliases
  datetime: 'date',
  timestamp: 'date',

  // Text aliases
  string: 'text',
  varchar: 'text',
} as const;
