/**
 * Simple utility function for formatting values
 * No React context or provider required
 */
import {
  DEFAULT_FORMATTER_CONTEXT,
  DataFormatterService,
} from './formatters/data-formatter.service';
import type { FormatterConfig } from './formatters/types';

// Create a singleton instance
let formatterService: DataFormatterService | null = null;

function getFormatterService(): DataFormatterService {
  if (!formatterService) {
    formatterService = new DataFormatterService(DEFAULT_FORMATTER_CONTEXT);
  }
  return formatterService;
}

/**
 * Format a value using the specified formatter configuration
 *
 * @param value - The value to format
 * @param config - The formatter configuration
 * @returns The formatted string
 *
 * @example
 * ```typescript
 * import { formatValue } from '@pymekit/cms-formatters';
 *
 * // Format a number as currency
 * const formatted = formatValue(1234.56, {
 *   type: 'currency',
 *   currency: 'USD'
 * });
 *
 * // Format a date
 * const formattedDate = formatValue(new Date(), {
 *   type: 'date',
 *   dateStyle: 'medium'
 * });
 * ```
 */
export function formatValue(value: unknown, config: FormatterConfig): string {
  const service = getFormatterService();
  const result = service.format(value, config);
  return result.formatted;
}

/**
 * Update the global formatter context
 * Useful for setting locale, timezone, or currency globally
 */
export function updateFormatterContext(
  updates: Partial<typeof DEFAULT_FORMATTER_CONTEXT>,
) {
  const service = getFormatterService();
  service.updateContext(updates);
}

/**
 * Get available formatters for a specific data type
 */
export function getAvailableFormatters(dataType?: string) {
  const service = getFormatterService();
  return service.getAvailableFormatters(dataType);
}

/**
 * Register a custom formatter
 */
export function registerFormatter(
  name: string,
  supportedTypes: string | string[],
  formatter: (value: unknown, config?: FormatterConfig) => string,
  tags?: string[],
) {
  const service = getFormatterService();
  const typesArray = Array.isArray(supportedTypes)
    ? supportedTypes
    : [supportedTypes];

  // Register for each supported type
  typesArray.forEach((type) => {
    service.registerFormatter(name, type, formatter, tags);
  });
}
