import type { ColumnMetadata } from '@pymekit/cms-types';

import type { FilterCondition } from '../types';

/**
 * Operator mapping from human-readable to internal operator names
 */
const OPERATOR_MAP: Record<string, string> = {
  // Equality
  equals: 'eq',
  eq: 'eq',
  notequals: 'neq',
  notEquals: 'neq',
  neq: 'neq',
  ne: 'neq',

  // Comparison
  greaterthan: 'gt',
  greaterThan: 'gt',
  gt: 'gt',
  greaterthanorequal: 'gte',
  greaterThanOrEqual: 'gte',
  gte: 'gte',
  lessthan: 'lt',
  lessThan: 'lt',
  lt: 'lt',
  lessthanorequal: 'lte',
  lessThanOrEqual: 'lte',
  lte: 'lte',

  // Range
  between: 'between',
  notBetween: 'notBetween',

  // Text
  contains: 'contains',
  like: 'contains',
  ilike: 'contains',
  startsWith: 'startsWith',
  endsWith: 'endsWith',

  // Array
  in: 'in',
  notIn: 'notIn',

  // Null
  isNull: 'isNull',
  isnull: 'isNull',
  notNull: 'notNull',
  notnull: 'notNull',
  isNotNull: 'notNull',
  isnotnull: 'notNull',

  // Date-specific
  before: 'before',
  beforeOrOn: 'beforeOrOn',
  after: 'after',
  afterOrOn: 'afterOrOn',
  during: 'during',

  // JSON
  hasKey: 'hasKey',
  haskey: 'hasKey',
  keyEquals: 'keyEquals',
  keyequals: 'keyEquals',
  pathExists: 'pathExists',
  pathexists: 'pathExists',
  containsText: 'containsText',
  containstext: 'containsText',
};

/**
 * Safely validates that a column exists in the metadata
 */
function validateColumn(columnName: string, columns: ColumnMetadata[]): void {
  const column = columns.find((col) => col.name === columnName);

  if (!column) {
    throw new Error(`Column '${columnName}' not found in table metadata`);
  }
}

/**
 * Safely validates that an operator is supported
 */
function validateOperator(operator: string): string {
  // Normalize operator to lowercase for case-insensitive matching
  const normalizedOp = operator.toLowerCase();

  // Check if it's a mapped operator (case-insensitive)
  const mappedOp = OPERATOR_MAP[normalizedOp];

  if (mappedOp) {
    return mappedOp;
  }

  // Check if it's already a valid internal operator
  const validInternalOperators = new Set([
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'notBetween',
    'contains',
    'startsWith',
    'endsWith',
    'in',
    'notIn',
    'isNull',
    'notNull',
    'before',
    'beforeOrOn',
    'after',
    'afterOrOn',
    'during',
    'hasKey',
    'keyEquals',
    'pathExists',
    'containsText',
  ]);

  if (validInternalOperators.has(operator)) {
    return operator;
  }

  // Default to 'eq' for unknown operators to maintain compatibility
  // This handles graceful degradation for unsupported operators
  return 'eq';
}

/**
 * Processes special values for operators that need value transformation
 */
function processValue(value: unknown, operator: string): unknown {
  // For null operators, only convert string 'true' to boolean for backward compatibility
  if (operator === 'isNull' || operator === 'notNull') {
    // Only convert string 'true' (case-insensitive) to boolean true
    if (typeof value === 'string' && value.toLowerCase() === 'true') {
      return true;
    }
    // Keep all other values as-is (including 'false', numbers, etc.)
    return value;
  }

  // For between/notBetween/during operators, ensure array format
  if (['between', 'notBetween', 'during'].includes(operator)) {
    // If already an array, return as-is
    if (Array.isArray(value)) {
      return value;
    }

    // Convert comma-separated string to array
    if (typeof value === 'string' && value.includes(',')) {
      return value.split(',').map((v) => v.trim());
    }

    // For single values, might be a malformed request but let validation handle it
    return value;
  }

  // For in/notIn operators, ensure array format
  if (operator === 'in' || operator === 'notIn') {
    // If already an array, return as-is
    if (Array.isArray(value)) {
      return value;
    }

    // Convert comma-separated string to array
    if (typeof value === 'string') {
      // Check if it looks like a JSON array
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          const parsed = JSON.parse(value);

          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          // Not valid JSON, continue with comma split
        }
      }

      // Split by comma
      if (value.includes(',')) {
        return value.split(',').map((v) => v.trim());
      }

      // Single value, wrap in array
      return [value];
    }

    // For non-string single values, wrap in array
    return [value];
  }

  // For JSON operators that expect key:value format
  if (operator === 'keyEquals' && typeof value === 'string') {
    // Value should be in format "key:value" or a JSON object string
    if (value.startsWith('{') && value.endsWith('}')) {
      try {
        // Try to parse as JSON
        JSON.parse(value);
        return value;
      } catch {
        // Not valid JSON, continue with key:value format
      }
    }
    // Return as-is for key:value format (handled by JsonValueProcessor)
    return value;
  }

  return value;
}

/**
 * Parses properties object into validated FilterCondition array
 *
 * @param properties - Object with keys like "column.operator" and values
 * @param columns - Column metadata for validation
 * @returns Array of validated FilterCondition objects
 * @throws Error if validation fails
 */
export function parsePropertiesToFilters(
  properties: Record<string, unknown>,
  columns: ColumnMetadata[],
): FilterCondition[] {
  const filters: FilterCondition[] = [];

  if (!properties || typeof properties !== 'object') {
    return filters;
  }

  for (const [rawKey, rawValue] of Object.entries(properties)) {
    // Skip undefined/null values and special keys
    if (rawValue === undefined || rawValue === null || rawKey === 'columns') {
      continue;
    }

    // Parse the key format: "column.operator"
    const keyParts = rawKey.split('.');
    const columnName = keyParts[0];
    const operatorName = keyParts[1];

    // Validate required parts
    if (!columnName) {
      continue; // Skip malformed keys
    }

    try {
      // Validate column exists
      validateColumn(columnName, columns);

      // Validate and map operator
      const operator = validateOperator(operatorName ?? 'eq');

      // Process the value
      const value = processValue(rawValue, operator);

      filters.push({
        column: columnName,
        operator,
        value,
      });
    } catch (error) {
      // Re-throw validation errors with context
      throw new Error(
        `Failed to parse filter for '${rawKey}': ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  return filters;
}
