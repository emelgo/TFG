import type { NumberFormatterConfig } from '../types';

/**
 * Number formatter with support for various number formats
 * Handles currency, percentage, compact notation, etc.
 */
export class NumberFormatter {
  private formatters = new Map<string, Intl.NumberFormat>();

  /**
   * Format a number value according to the configuration
   */
  format(value: unknown, config?: NumberFormatterConfig): string {
    // Handle null/undefined
    if (value == null) {
      return '—';
    }

    // Convert to number
    const numValue = this.toNumber(value);

    if (isNaN(numValue)) {
      return '—';
    }

    // Get default config
    const formatterConfig: NumberFormatterConfig = {
      type: 'number',
      locale: 'en-US',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      ...config,
    };

    // Create formatter key for caching
    const formatterKey = this.createFormatterKey(formatterConfig);

    // Get or create cached formatter
    let formatter = this.formatters.get(formatterKey);

    if (!formatter) {
      formatter = this.createFormatter(formatterConfig);
      this.formatters.set(formatterKey, formatter);
    }

    // Format the value
    let formatted = formatter.format(numValue);

    // Add prefix/suffix if specified
    if (formatterConfig.prefix) {
      formatted = formatterConfig.prefix + formatted;
    }

    if (formatterConfig.suffix) {
      formatted = formatted + formatterConfig.suffix;
    }

    return formatted;
  }

  /**
   * Format a percentage (handles conversion from decimal)
   */
  formatPercentage(
    value: unknown,
    config?: Omit<NumberFormatterConfig, 'type'>,
  ): string {
    const numValue = this.toNumber(value);

    if (isNaN(numValue)) {
      return '—';
    }

    // For percentages, we typically want to convert from decimal (0.1 -> 10%)
    // Unless the value is already > 1, in which case assume it's already in percentage form
    const percentValue = numValue <= 1 ? numValue : numValue / 100;

    return this.format(percentValue, {
      type: 'percentage',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      ...config,
    });
  }

  /**
   * Format currency with proper symbol and precision
   */
  formatCurrency(
    value: unknown,
    currency = 'USD',
    config?: Omit<NumberFormatterConfig, 'type' | 'currency'>,
  ): string {
    return this.format(value, {
      type: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...config,
    });
  }

  /**
   * Format with compact notation (1.2K, 1.5M, etc.)
   */
  formatCompact(
    value: unknown,
    config?: Omit<NumberFormatterConfig, 'type' | 'notation'>,
  ): string {
    return this.format(value, {
      type: 'compact',
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
      ...config,
    });
  }

  /**
   * Create an Intl.NumberFormat based on configuration
   */
  private createFormatter(config: NumberFormatterConfig): Intl.NumberFormat {
    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits: config.minimumFractionDigits,
      maximumFractionDigits: config.maximumFractionDigits,
      minimumIntegerDigits: config.minimumIntegerDigits,
      useGrouping: config.useGrouping,
      ...(config.roundingMode && {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        roundingMode: config.roundingMode as any,
      }),
    };

    // Handle different number types
    switch (config.type) {
      case 'currency':
        options.style = 'currency';
        options.currency = config.currency || 'USD';
        options.currencyDisplay = config.currencyDisplay || 'symbol';
        break;

      case 'percentage':
        options.style = 'percent';
        break;

      case 'compact':
      case 'scientific':
      case 'engineering':
        options.notation = config.notation || config.type;

        if (config.type === 'compact') {
          options.compactDisplay = config.compactDisplay || 'short';
        }

        break;

      case 'decimal':
      case 'number':
      default:
        options.style = 'decimal';
        break;
    }

    return new Intl.NumberFormat(config.locale, options);
  }

  /**
   * Convert various input types to number
   */
  private toNumber(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      // Handle empty strings
      if (value.trim() === '') {
        return NaN;
      }

      // Try to parse as number
      const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
      return parsed;
    }

    if (typeof value === 'bigint') {
      return Number(value);
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    return NaN;
  }

  /**
   * Create a unique key for caching formatters
   */
  private createFormatterKey(config: NumberFormatterConfig): string {
    const keyParts = [
      config.type,
      config.locale,
      config.minimumFractionDigits,
      config.maximumFractionDigits,
      config.minimumIntegerDigits,
      config.currency,
      config.currencyDisplay,
      config.notation,
      config.compactDisplay,
      config.useGrouping,
      config.roundingMode,
    ];

    return keyParts.filter((part) => part !== undefined).join('|');
  }

  /**
   * Clear cached formatters (useful for memory management)
   */
  clearCache(): void {
    this.formatters.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.formatters.size,
      keys: Array.from(this.formatters.keys()),
    };
  }
}
