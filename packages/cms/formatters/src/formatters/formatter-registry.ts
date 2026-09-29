import type { FormatterConfig, FormatterRegistryEntry } from './types';

/**
 * Registry for managing data formatters
 * Allows registration of custom formatters and lookup by type
 */
export class FormatterRegistry {
  private formatters = new Map<string, FormatterRegistryEntry>();
  private typeToFormattersMap = new Map<string, Set<string>>();

  /**
   * Register a formatter
   */
  register<T = unknown>(entry: FormatterRegistryEntry<T>): void {
    // Store the formatter
    this.formatters.set(entry.name, entry as FormatterRegistryEntry);

    // Index by supported data types
    if (entry.supportedTypes) {
      entry.supportedTypes.forEach((dataType) => {
        if (!this.typeToFormattersMap.has(dataType)) {
          this.typeToFormattersMap.set(dataType, new Set());
        }
        this.typeToFormattersMap.get(dataType)!.add(entry.name);
      });
    }
  }

  /**
   * Get a formatter by name
   */
  get(name: string): FormatterRegistryEntry | undefined {
    return this.formatters.get(name);
  }

  /**
   * Get all registered formatters
   */
  getAll(): FormatterRegistryEntry[] {
    return Array.from(this.formatters.values());
  }

  /**
   * Get formatters that support a specific data type
   */
  getFormattersForDataType(dataType: string): FormatterRegistryEntry[] {
    const formatterNames = this.typeToFormattersMap.get(dataType.toLowerCase());
    if (!formatterNames) {
      return [];
    }

    return Array.from(formatterNames)
      .map((name) => this.formatters.get(name))
      .filter(
        (formatter): formatter is FormatterRegistryEntry =>
          formatter !== undefined,
      );
  }

  /**
   * Get available formatters for a data type (name and type only)
   */
  getAvailableFormatters(
    dataType?: string,
  ): Array<{ name: string; type: FormatterConfig['type'] }> {
    let formatters: FormatterRegistryEntry[];

    if (dataType) {
      formatters = this.getFormattersForDataType(dataType);
    } else {
      formatters = this.getAll();
    }

    return formatters.map((formatter) => ({
      name: formatter.name,
      type: formatter.type,
    }));
  }

  /**
   * Check if a formatter is registered
   */
  has(name: string): boolean {
    return this.formatters.has(name);
  }

  /**
   * Remove a formatter
   */
  unregister(name: string): boolean {
    const formatter = this.formatters.get(name);
    if (!formatter) {
      return false;
    }

    // Remove from formatters map
    this.formatters.delete(name);

    // Remove from type mappings
    if (formatter.supportedTypes) {
      formatter.supportedTypes.forEach((dataType) => {
        const typeFormatters = this.typeToFormattersMap.get(dataType);
        if (typeFormatters) {
          typeFormatters.delete(name);
          if (typeFormatters.size === 0) {
            this.typeToFormattersMap.delete(dataType);
          }
        }
      });
    }

    return true;
  }

  /**
   * Clear all formatters
   */
  clear(): void {
    this.formatters.clear();
    this.typeToFormattersMap.clear();
  }

  /**
   * Get statistics about registered formatters
   */
  getStats(): {
    totalFormatters: number;
    supportedDataTypes: number;
    formattersByType: Record<string, number>;
  } {
    const formattersByType: Record<string, number> = {};

    this.formatters.forEach((formatter) => {
      const type = formatter.type;
      formattersByType[type] = (formattersByType[type] || 0) + 1;
    });

    return {
      totalFormatters: this.formatters.size,
      supportedDataTypes: this.typeToFormattersMap.size,
      formattersByType,
    };
  }
}
