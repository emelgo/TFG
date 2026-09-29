import type { ColumnMetadata } from '@pymekit/cms-types';

import { getOperator } from './operators/operator-registry';
import {
  BooleanValueProcessor,
  DateValueProcessor,
  JsonValueProcessor,
  NumericValueProcessor,
  TextValueProcessor,
} from './processors/value-processors';
import type { FilterCondition, FilterContext, ValueProcessor } from './types';

/**
 * Core filter builder that handles common filtering logic
 * Provides extension points for service-specific customization
 */
export class FilterBuilder {
  constructor(private context: FilterContext) {}

  getContext(): FilterContext {
    return this.context;
  }

  /**
   * Update the filter context (e.g., when switching tables)
   */
  updateContext(updates: Partial<FilterContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Build a complete WHERE clause from multiple filter conditions
   */
  buildWhere(filters: FilterCondition[]): string {
    if (!filters || filters.length === 0) {
      return '';
    }

    const conditions = filters.map((filter, index) => {
      const condition = this.buildCondition(filter);
      const logicalOp = filter.logicalOperator || 'AND';

      // Don't add logical operator to the last condition
      if (index === filters.length - 1) {
        return condition;
      }

      return `${condition} ${logicalOp}`;
    });

    return `WHERE ${conditions.join(' ')}`;
  }

  /**
   * Build a single filter condition
   */
  buildCondition(filter: FilterCondition): string {
    // Check for custom handlers first
    if (this.context.customHandlers) {
      for (const [_name, handler] of Object.entries(
        this.context.customHandlers,
      )) {
        if (handler.canHandle(filter, this.context)) {
          return handler.process(filter, this.context);
        }
      }
    }

    // Use built-in processing
    const column = this.getColumnMetadata(filter.column);

    if (!column) {
      throw new Error(`Column '${filter.column}' not found in metadata`);
    }

    return this.processStandardFilter(filter, column);
  }

  /**
   * Validate a filter condition
   */
  validateFilter(filter: FilterCondition): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check if column exists
    const column = this.getColumnMetadata(filter.column);

    if (!column) {
      errors.push(`Column '${filter.column}' not found`);

      return { isValid: false, errors };
    }

    // Check if operator is supported for this data type
    const operator = getOperator(filter.operator);
    const dataType = column.ui_config.data_type.toLowerCase();

    if (
      !operator.supportedTypes.includes('all') &&
      !operator.supportedTypes.some((type) => dataType.includes(type))
    ) {
      errors.push(
        `Operator '${filter.operator}' not supported for data type '${dataType}'`,
      );
    }

    // Try to process the value to check for validation errors
    try {
      const processor = this.getValueProcessor(column.ui_config.data_type);

      processor.process(filter.value, filter.operator, column);
    } catch (error) {
      errors.push(
        `Invalid value: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Process a standard filter using built-in logic
   */
  private processStandardFilter(
    filter: FilterCondition,
    column: ColumnMetadata,
  ): string {
    const processor = this.getValueProcessor(column.ui_config.data_type);

    const processedValue = processor.process(
      filter.value,
      filter.operator,
      column,
    );

    const operator = getOperator(filter.operator);

    return operator.generateSql(filter.column, processedValue, this.context);
  }

  /**
   * Get column metadata by name
   */
  private getColumnMetadata(columnName: string): ColumnMetadata | undefined {
    return this.context.columns.find((col) => col.name === columnName);
  }

  /**
   * Get appropriate value processor for data type
   */
  private getValueProcessor(dataType: string): ValueProcessor {
    const normalizedType = dataType.toLowerCase();

    if (
      ['date', 'timestamp', 'timestamp with time zone'].includes(normalizedType)
    ) {
      return new DateValueProcessor();
    }

    if (
      ['integer', 'bigint', 'numeric', 'real', 'double precision'].includes(
        normalizedType,
      )
    ) {
      return new NumericValueProcessor();
    }

    if (normalizedType === 'boolean') {
      return new BooleanValueProcessor();
    }

    if (['json', 'jsonb'].includes(normalizedType)) {
      return new JsonValueProcessor();
    }

    // Note: IN/NOT IN operators are handled by operator logic, not by data type

    return new TextValueProcessor();
  }
}
