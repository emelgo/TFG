/**
 * WHERE clause builder
 *
 * Handles building WHERE clauses from filter conditions with parameterized queries
 * using Drizzle's SQL template tag for security.
 */
import { type SQL, sql } from 'drizzle-orm';

import {
  extractRelativeDateOption,
  getRelativeDateRange,
  isRelativeDate,
} from '@pymekit/cms-filters-core';
import type { FilterCondition } from '@pymekit/cms-filters-core';

import type { WhereClause } from '../types/clause-types';

type LogicalOperator = 'AND' | 'OR';

export class WhereBuilder {
  private constructor() {
    // Static class - no instantiation
  }

  /**
   * Build WHERE clause from filter conditions
   */
  static fromFilters(
    filters: readonly FilterCondition[],
    combineWith: LogicalOperator = 'AND',
  ): WhereClause | null {
    if (filters.length === 0) {
      return null;
    }

    const conditions = filters.map((filter) =>
      this.buildFilterCondition(filter),
    );

    return {
      conditions,
      combineWith,
    };
  }

  /**
   * Build a single filter condition using parameterized SQL
   */
  private static buildFilterCondition(filter: FilterCondition): SQL {
    const { column, operator, value } = filter as FilterCondition & {
      operator: string;
    };

    // Handle relative date values - need to resolve them before using in SQL
    let resolvedValue = value;
    if (typeof value === 'string' && isRelativeDate(value)) {
      const option = extractRelativeDateOption(value);

      if (option) {
        const range = getRelativeDateRange(option);

        // For range-based operators or equality, handle specially
        if (
          ['eq', 'neq', 'during', 'between', 'notBetween'].includes(operator)
        ) {
          const col = sql.identifier(column);

          if (
            operator === 'eq' ||
            operator === 'during' ||
            operator === 'between'
          ) {
            return sql`${col} BETWEEN ${range.start.toISOString()} AND ${range.end.toISOString()}`;
          } else if (operator === 'neq' || operator === 'notBetween') {
            return sql`${col} NOT BETWEEN ${range.start.toISOString()} AND ${range.end.toISOString()}`;
          }
        }

        // For comparison operators, use appropriate boundary
        switch (operator) {
          case 'gt':
          case 'after':
            resolvedValue = range.end.toISOString(); // Use end of range for "greater than"
            break;
          case 'gte':
          case 'afterOrOn':
            resolvedValue = range.start.toISOString(); // Use start of range for "greater than or equal"
            break;
          case 'lt':
          case 'before':
            resolvedValue = range.start.toISOString(); // Use start of range for "less than"
            break;
          case 'lte':
          case 'beforeOrOn':
            resolvedValue = range.end.toISOString(); // Use end of range for "less than or equal"
            break;
          default:
            resolvedValue = range.start.toISOString(); // Default to start of range
        }
      }
    }

    // Handle date values (non-relative) with date-aware operators using FilterBuilder
    if (
      typeof resolvedValue === 'string' &&
      !isRelativeDate(resolvedValue) &&
      this.isDateValue(resolvedValue) &&
      [
        'eq',
        'neq',
        'before',
        'after',
        'beforeOrOn',
        'afterOrOn',
        'during',
      ].includes(operator)
    ) {
      return this.buildFilterWithSharedLogic(
        column,
        operator,
        resolvedValue as string,
      );
    }

    const col = sql.identifier(column);

    switch (operator) {
      case 'eq':
        return this.buildEqualityCondition(col, resolvedValue, '=');
      case 'neq':
        return this.buildEqualityCondition(col, resolvedValue, '!=');
      case 'gt':
        return sql`${col} > ${resolvedValue}`;
      case 'gte':
        return sql`${col} >= ${resolvedValue}`;
      case 'lt':
        return sql`${col} < ${resolvedValue}`;
      case 'lte':
        return sql`${col} <= ${resolvedValue}`;

      // Text operations
      case 'contains':
        return sql`${col} ILIKE ${'%' + String(value) + '%'}`;
      case 'containsText':
        // For JSON/JSONB columns, cast to text first
        return sql`${col}::text ILIKE ${'%' + String(value) + '%'}`;
      case 'startsWith':
        return sql`${col} ILIKE ${String(value) + '%'}`;
      case 'endsWith':
        return sql`${col} ILIKE ${'%' + String(value)}`;

      // List operations
      case 'in':
        return this.buildInCondition(col, value, 'IN');
      case 'notIn':
        return this.buildInCondition(col, value, 'NOT IN');

      // Null checks
      case 'isNull':
        return sql`${col} IS NULL`;
      case 'notNull':
        return sql`${col} IS NOT NULL`;

      // Range operations
      case 'between':
        return this.buildBetweenCondition(col, value, false);
      case 'notBetween':
        return this.buildBetweenCondition(col, value, true);

      // Date operations
      case 'before':
        return sql`${col} < ${value}`;
      case 'beforeOrOn':
        return sql`${col} <= ${value}`;
      case 'after':
        return sql`${col} > ${value}`;
      case 'afterOrOn':
        return sql`${col} >= ${value}`;
      case 'during':
        return this.buildBetweenCondition(col, value, false);

      // JSON operations
      case 'hasKey':
        return sql`${col} ? ${String(value)}`;
      case 'keyEquals': {
        const [keyPath, keyValue] = Array.isArray(value) ? value : [value, ''];
        return sql`${col}->>${String(keyPath)} = ${String(keyValue)}`;
      }
      case 'pathExists':
        return sql`${col} #> ${'{' + String(value) + '}'} IS NOT NULL`;

      default:
        // Default to equality
        return this.buildEqualityCondition(col, value, '=');
    }
  }

  /**
   * Build equality condition (= or !=)
   */
  private static buildEqualityCondition(
    column: unknown,
    value: unknown,
    operator: '=' | '!=',
  ): SQL {
    if (operator === '=') {
      return sql`${column} = ${value}`;
    } else {
      return sql`${column} != ${value}`;
    }
  }

  /**
   * Build IN/NOT IN condition
   */
  private static buildInCondition(
    column: unknown,
    value: unknown,
    operator: 'IN' | 'NOT IN',
  ): SQL {
    const values = Array.isArray(value) ? value : [value];

    if (values.length === 0) {
      // Empty IN clause - return FALSE for IN, TRUE for NOT IN
      return operator === 'IN' ? sql`FALSE` : sql`TRUE`;
    }

    // Use sql.join to properly separate array values as individual parameters
    // This avoids the double-parentheses bug where the array was treated as a single param
    const valuesList = sql.join(
      values.map((v) => sql`${v}`),
      sql`, `,
    );

    if (operator === 'IN') {
      return sql`${column} IN (${valuesList})`;
    } else {
      return sql`${column} NOT IN (${valuesList})`;
    }
  }

  /**
   * Build BETWEEN/NOT BETWEEN condition
   */
  private static buildBetweenCondition(
    column: unknown,
    value: unknown,
    negated: boolean,
  ): SQL {
    let startValue: unknown;
    let endValue: unknown;

    if (typeof value === 'string' && value.includes(',')) {
      [startValue, endValue] = value.split(',');
    } else if (Array.isArray(value) && value.length >= 2) {
      [startValue, endValue] = value as unknown[];
    } else {
      // Invalid between condition
      return negated ? sql`TRUE` : sql`FALSE`;
    }

    if (negated) {
      return sql`${column} NOT BETWEEN ${startValue} AND ${endValue}`;
    } else {
      return sql`${column} BETWEEN ${startValue} AND ${endValue}`;
    }
  }

  /**
   * Check if a value is likely a date string
   */
  private static isDateValue(value: string): boolean {
    // Quick checks for common date patterns
    if (!/\d{4}|\d{2}[-\\/]\d{2}/.test(value)) {
      return false; // No year or date separator pattern
    }

    // Try to parse as date
    const date = new Date(value);

    return (
      !isNaN(date.getTime()) &&
      date.getFullYear() > 1900 &&
      date.getFullYear() < 2100
    );
  }

  /**
   * Build filter condition for date values using parameterized queries.
   * Handles date-aware operators with proper date boundary calculations.
   */
  private static buildFilterWithSharedLogic(
    column: string,
    operator: string,
    value: string,
  ): SQL {
    const col = sql.identifier(column);

    // Parse the date value
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      // Invalid date - fall back to simple equality with parameterized value
      return sql`${col} = ${value}`;
    }

    // Calculate date boundaries for date-only comparisons
    // Start of day (00:00:00.000) and end of day (23:59:59.999)
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Use ISO strings for database compatibility
    const startISO = startOfDay.toISOString();
    const endISO = endOfDay.toISOString();

    // Build parameterized SQL based on operator
    switch (operator) {
      case 'eq':
      case 'during':
        // Date equality means any time during that day
        return sql`${col} BETWEEN ${startISO} AND ${endISO}`;
      case 'neq':
        // Not equal means outside the entire day
        return sql`${col} NOT BETWEEN ${startISO} AND ${endISO}`;
      case 'before':
        // Before means strictly before start of day
        return sql`${col} < ${startISO}`;
      case 'beforeOrOn':
        // Before or on means before end of day (includes entire day)
        return sql`${col} <= ${endISO}`;
      case 'after':
        // After means strictly after end of day
        return sql`${col} > ${endISO}`;
      case 'afterOrOn':
        // After or on means from start of day onwards
        return sql`${col} >= ${startISO}`;
      default:
        // Fallback to simple equality with parameterized value
        return sql`${col} = ${value}`;
    }
  }

  /**
   * Build WHERE clause with custom conditions
   */
  static custom(
    conditions: readonly SQL[],
    combineWith: LogicalOperator = 'AND',
  ): WhereClause {
    return {
      conditions: [...conditions],
      combineWith,
    };
  }

  /**
   * Build WHERE clause with a single condition
   */
  static single(condition: SQL): WhereClause {
    return {
      conditions: [condition],
      combineWith: 'AND',
    };
  }
}
