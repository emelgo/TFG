import { endOfDay, startOfDay } from 'date-fns';

import type { ColumnMetadata } from '@pymekit/cms-types';

import type { ProcessedValue, ValueProcessor } from '../types';
import {
  extractRelativeDateOption,
  getRelativeDateRange,
  isRelativeDate,
} from '../utils/date-utils';

/**
 * Base utility for escaping SQL values
 */
function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Check if a column data type represents a date/timestamp column
 * Shared utility to maintain consistency with filter-builder.ts
 */
function isDateTimeColumn(dataType: string): boolean {
  const normalizedType = dataType.toLowerCase();
  return ['date', 'timestamp', 'timestamp with time zone'].includes(
    normalizedType,
  );
}

/**
 * Date-aware value processor
 * Handles relative dates and converts date equality to ranges
 */
export class DateValueProcessor implements ValueProcessor {
  process(
    value: unknown,
    operator: string,
    column: ColumnMetadata,
  ): ProcessedValue {
    // Handle relative dates
    if (typeof value === 'string' && isRelativeDate(value)) {
      return this.processRelativeDate(value, operator);
    }

    // Handle range operators (between, notBetween) with arrays
    if (
      (operator === 'between' || operator === 'notBetween') &&
      Array.isArray(value) &&
      value.length >= 2
    ) {
      const startDate = new Date(value[0]);
      const endDate = new Date(value[1]);

      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
        return {
          escaped: `'${startDate.toISOString()}', '${endDate.toISOString()}'`,
          isRange: true,
          start: `'${startDate.toISOString()}'`,
          end: `'${endDate.toISOString()}'`,
          original: value,
        };
      }
    }

    // Handle absolute date equality -> convert to range for date/timestamp columns only
    if (operator === 'eq' && typeof value === 'string') {
      // Only apply date processing to actual date/timestamp columns
      if (isDateTimeColumn(column.ui_config.data_type)) {
        // Reject pure numeric strings (likely IDs/years) even in date columns
        if (/^\d{1,4}$/.test(value)) {
          return {
            escaped: escapeValue(value),
            original: value,
          };
        }

        // Try to parse as date for range expansion (preserves dashboard functionality)
        try {
          const date = new Date(value);

          // Only proceed if it's a valid date and the string looks date-like
          if (!isNaN(date.getTime()) && value.includes('-')) {
            const startOfDayDate = startOfDay(date);
            const endOfDayDate = endOfDay(date);

            return {
              escaped: `'${startOfDayDate.toISOString()}'`,
              isRange: true,
              start: `'${startOfDayDate.toISOString()}'`,
              end: `'${endOfDayDate.toISOString()}'`,
              original: value,
            };
          }
        } catch {
          // Fall through to default handling
        }
      }

      // For non-date columns or invalid dates, pass through as literal
      return {
        escaped: escapeValue(value),
        original: value,
      };
    }

    return {
      escaped: escapeValue(value),
      original: value,
    };
  }

  private processRelativeDate(
    value: string,
    _operator: string,
  ): ProcessedValue {
    const option = extractRelativeDateOption(value);

    if (!option) {
      return {
        escaped: escapeValue(value),
        original: value,
      };
    }

    const range = getRelativeDateRange(option);

    return {
      escaped: `'${range.start.toISOString()}'`,
      isRange: true,
      start: `'${range.start.toISOString()}'`,
      end: `'${range.end.toISOString()}'`,
      original: value,
    };
  }
}

/**
 * Numeric value processor
 */
export class NumericValueProcessor implements ValueProcessor {
  process(
    value: unknown,
    operator: string,
    _column: ColumnMetadata,
  ): ProcessedValue {
    if (value === null || value === undefined) {
      return { escaped: 'NULL', original: value };
    }

    // Handle array values for IN/NOT IN operators
    if ((operator === 'in' || operator === 'notIn') && Array.isArray(value)) {
      // Let the operator handle the array processing
      return {
        escaped: value.map((v) => String(v)).join(', '),
        original: value,
      };
    }

    // Handle array values for range operations (between, notBetween)
    if (
      (operator === 'between' || operator === 'notBetween') &&
      Array.isArray(value) &&
      value.length >= 2
    ) {
      const startNum = Number(value[0]);
      const endNum = Number(value[1]);

      if (isNaN(startNum) || isNaN(endNum)) {
        throw new Error(`Invalid numeric values in array: ${value}`);
      }

      return {
        escaped: `${startNum}, ${endNum}`,
        isRange: true,
        start: String(startNum),
        end: String(endNum),
        original: value,
      };
    }

    const numValue = Number(value);
    if (isNaN(numValue)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }

    return {
      escaped: String(numValue),
      original: value,
    };
  }
}

/**
 * Text value processor
 * Handles LIKE operators with wildcards
 */
export class TextValueProcessor implements ValueProcessor {
  process(
    value: unknown,
    operator: string,
    _column: ColumnMetadata,
  ): ProcessedValue {
    if (value === null || value === undefined) {
      return { escaped: 'NULL', original: value };
    }

    // Handle array values for IN/NOT IN operators
    if ((operator === 'in' || operator === 'notIn') && Array.isArray(value)) {
      // Let the operator handle the array processing
      return {
        escaped: value
          .map((v) => `'${String(v).replace(/'/g, "''")}'`)
          .join(', '),
        original: value,
      };
    }

    let processedValue = String(value);

    // Add wildcards for LIKE operators
    if (['contains', 'like'].includes(operator)) {
      processedValue = `%${processedValue}%`;
    } else if (operator === 'startsWith') {
      processedValue = `${processedValue}%`;
    } else if (operator === 'endsWith') {
      processedValue = `%${processedValue}`;
    }

    return {
      escaped: `'${processedValue.replace(/'/g, "''")}'`,
      original: value,
    };
  }
}

/**
 * Boolean value processor
 */
export class BooleanValueProcessor implements ValueProcessor {
  process(
    value: unknown,
    _operator: string,
    _column: ColumnMetadata,
  ): ProcessedValue {
    if (value === null || value === undefined) {
      return { escaped: 'NULL', original: value };
    }

    let boolValue: boolean;
    if (typeof value === 'boolean') {
      boolValue = value;
    } else if (typeof value === 'string') {
      boolValue = value.toLowerCase() === 'true';
    } else {
      boolValue = Boolean(value);
    }

    return {
      escaped: boolValue ? 'TRUE' : 'FALSE',
      original: value,
    };
  }
}

/**
 * JSON value processor
 * Handles JSON/JSONB operators
 */
export class JsonValueProcessor implements ValueProcessor {
  process(
    value: unknown,
    operator: string,
    _column: ColumnMetadata,
  ): ProcessedValue {
    if (value === null || value === undefined) {
      return { escaped: 'NULL', original: value };
    }

    // Handle specific JSON operators
    switch (operator) {
      case 'hasKey':
        return {
          escaped: `'${String(value).replace(/'/g, "''")}'`,
          original: value,
        };

      case 'keyEquals': {
        // Expected format: "key:value"
        const keyValue = String(value);
        if (keyValue.includes(':')) {
          const [key, val] = keyValue.split(':', 2);
          if (!key || !val) {
            break;
          }
          const cleanKey = key.trim().replace(/'/g, "''");
          const cleanVal = val.trim().replace(/'/g, "''");

          // Create JSON object for comparison
          let jsonValue: unknown;
          if (cleanVal === 'null') {
            jsonValue = null;
          } else if (cleanVal === 'true' || cleanVal === 'false') {
            jsonValue = cleanVal; // Keep as string for compatibility
          } else if (/^-?\d+(\.\d+)?$/.test(cleanVal)) {
            jsonValue = Number(cleanVal);
          } else {
            jsonValue = cleanVal;
          }

          const jsonObj = { [cleanKey]: jsonValue };
          return {
            escaped: `'${JSON.stringify(jsonObj).replace(/'/g, "''")}'`,
            original: value,
          };
        }
        break;
      }

      case 'pathExists': {
        // Convert JSONPath to PostgreSQL array format
        let pathArray: string[];
        const pathValue = String(value);

        if (pathValue.startsWith('$.')) {
          pathArray = pathValue.substring(2).split('.');
        } else if (pathValue === '$') {
          pathArray = [];
        } else {
          pathArray = [pathValue];
        }

        return {
          escaped: `'{${pathArray.join(',')}}'`,
          original: value,
        };
      }

      case 'containsText':
        return {
          escaped: `'%${String(value).replace(/'/g, "''").replace(/%/g, '\\%')}%'`,
          original: value,
        };
    }

    // Default JSON handling
    if (typeof value === 'object') {
      return {
        escaped: `'${JSON.stringify(value).replace(/'/g, "''")}'`,
        original: value,
      };
    }

    return {
      escaped: `'${String(value).replace(/'/g, "''")}'`,
      original: value,
    };
  }
}
