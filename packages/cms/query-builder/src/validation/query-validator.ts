/**
 * Query validation utilities
 */
import {
  QueryBuilderError,
  QueryBuilderErrorCode,
} from '../errors/query-builder-errors';
import type { JoinClause, WhereClause } from '../types/clause-types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class QueryValidator {
  private readonly allowedSchemas: Set<string>;
  private readonly allowedTables: Set<string>;
  private readonly maxJoins: number;

  constructor(options?: {
    allowedSchemas?: string[];
    allowedTables?: string[];
    maxJoins?: number;
  }) {
    this.allowedSchemas = new Set(options?.allowedSchemas || []);
    this.allowedTables = new Set(options?.allowedTables || []);
    this.maxJoins = options?.maxJoins || 10;
  }

  /**
   * Validate a complete query configuration
   */
  validateQuery(config: {
    schema?: string;
    table?: string;
    joins?: JoinClause[];
    where?: WhereClause;
  }): ValidationResult {
    const errors: string[] = [];

    // Validate schema if restrictions are set
    if (this.allowedSchemas.size > 0 && config.schema) {
      if (!this.allowedSchemas.has(config.schema)) {
        errors.push(`Schema '${config.schema}' is not allowed`);
      }
    }

    // Validate table if restrictions are set
    if (this.allowedTables.size > 0 && config.table) {
      if (!this.allowedTables.has(config.table)) {
        errors.push(`Table '${config.table}' is not allowed`);
      }
    }

    // Validate joins
    if (config.joins) {
      const joinErrors = this.validateJoins(config.joins);
      errors.push(...joinErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate JOIN clauses
   */
  validateJoins(joins: JoinClause[]): string[] {
    const errors: string[] = [];

    if (joins.length > this.maxJoins) {
      errors.push(
        `Too many JOINs (${joins.length}). Maximum allowed: ${this.maxJoins}`,
      );
    }

    for (const join of joins) {
      // Check for SQL injection in condition
      if (!this.isSafeCondition(join.condition)) {
        errors.push(`Potentially unsafe JOIN condition: ${join.condition}`);
      }

      // Validate schema if restrictions are set
      if (this.allowedSchemas.size > 0 && join.table.schema) {
        if (!this.allowedSchemas.has(join.table.schema)) {
          errors.push(`JOIN schema '${join.table.schema}' is not allowed`);
        }
      }

      // Validate table if restrictions are set
      if (this.allowedTables.size > 0) {
        if (!this.allowedTables.has(join.table.table)) {
          errors.push(`JOIN table '${join.table.table}' is not allowed`);
        }
      }
    }

    return errors;
  }

  /**
   * Validate a column name
   */
  validateColumn(column?: string): void {
    if (!column || column.trim() === '') {
      return; // Allow empty columns for optional fields
    }

    // Basic SQL injection protection
    if (!this.isSafeIdentifier(column)) {
      throw new QueryBuilderError(
        QueryBuilderErrorCode.INVALID_COLUMN,
        `Invalid column name: ${column}`,
      );
    }
  }

  /**
   * Validate multiple columns
   */
  validateColumns(columns: string[]): void {
    for (const column of columns) {
      this.validateColumn(column);
    }
  }

  /**
   * Validate schema name
   */
  validateSchema(schema?: string): void {
    if (!schema) return;

    if (this.allowedSchemas.size > 0 && !this.allowedSchemas.has(schema)) {
      throw new QueryBuilderError(
        QueryBuilderErrorCode.UNAUTHORIZED_SCHEMA,
        `Schema '${schema}' is not allowed`,
      );
    }

    if (!this.isSafeIdentifier(schema)) {
      throw new QueryBuilderError(
        QueryBuilderErrorCode.INVALID_SCHEMA,
        `Invalid schema name: ${schema}`,
      );
    }
  }

  /**
   * Validate table name
   */
  validateTable(table?: string): void {
    if (!table) return;

    if (this.allowedTables.size > 0 && !this.allowedTables.has(table)) {
      throw new QueryBuilderError(
        QueryBuilderErrorCode.UNAUTHORIZED_TABLE,
        `Table '${table}' is not allowed`,
      );
    }

    if (!this.isSafeIdentifier(table)) {
      throw new QueryBuilderError(
        QueryBuilderErrorCode.INVALID_TABLE,
        `Invalid table name: ${table}`,
      );
    }
  }

  /**
   * Validate widget type
   */
  validateWidgetType(widgetType: string): void {
    const validTypes = ['chart', 'metric', 'table'];
    if (!validTypes.includes(widgetType)) {
      throw new QueryBuilderError(
        QueryBuilderErrorCode.INVALID_WIDGET_TYPE,
        `Invalid widget type: ${widgetType}`,
      );
    }
  }

  /**
   * Validate aggregation type
   */
  validateAggregation(aggregation: string): void {
    const validAggregations = ['count', 'sum', 'avg', 'min', 'max'];
    if (!validAggregations.includes(aggregation.toLowerCase())) {
      throw new QueryBuilderError(
        QueryBuilderErrorCode.INVALID_AGGREGATION,
        `Invalid aggregation type: ${aggregation}`,
      );
    }
  }

  /**
   * Static method for aggregation validation
   */
  static validateAggregation(aggregation: string): void {
    const validAggregations = ['count', 'sum', 'avg', 'min', 'max'];
    if (!validAggregations.includes(aggregation.toLowerCase())) {
      throw new QueryBuilderError(
        QueryBuilderErrorCode.INVALID_AGGREGATION,
        `Invalid aggregation type: ${aggregation}`,
      );
    }
  }

  /**
   * Validate time interval
   */
  validateTimeInterval(interval?: string): void {
    if (!interval) return;

    const validIntervals = [
      'minute',
      'hour',
      'day',
      'week',
      'month',
      'quarter',
      'year',
    ];
    if (!validIntervals.includes(interval.toLowerCase())) {
      throw new QueryBuilderError(
        QueryBuilderErrorCode.INVALID_TIME_INTERVAL,
        `Invalid time interval: ${interval}`,
      );
    }
  }

  /**
   * Validate query complexity (basic implementation)
   */
  validateQueryComplexity(query: unknown): void {
    // Basic complexity check - can be enhanced
    if (!query) return;

    // For now, just ensure query exists and isn't too complex
    // This is a placeholder for more sophisticated complexity analysis
  }

  /**
   * Check if an identifier is safe from SQL injection
   */
  private isSafeIdentifier(identifier: string): boolean {
    // Allow alphanumeric, underscore, hyphens, and dots for schema.table notation
    // Hyphens are safe when quoted
    return /^[a-zA-Z_][a-zA-Z0-9_-]*(\.[a-zA-Z_][a-zA-Z0-9_-]*)?$/.test(
      identifier,
    );
  }

  /**
   * Check if a SQL condition is safe from injection
   */
  isSafeCondition(condition: string): boolean {
    // Check for dangerous SQL keywords that suggest injection
    const dangerousPatterns = [
      /;\s*DELETE/i,
      /;\s*DROP/i,
      /;\s*UPDATE/i,
      /;\s*INSERT/i,
      /;\s*CREATE/i,
      /;\s*ALTER/i,
      /;\s*EXEC/i,
      /;\s*EXECUTE/i,
      /--/, // SQL comments
      /\/\*/, // Multi-line comments
      /\*\//,
      /\bUNION\b.*\bSELECT\b/i, // UNION attacks
      /\bINTO\s+OUTFILE\b/i, // File operations
      /\bLOAD_FILE\b/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(condition)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate identifier (table/column name)
   */
  static isValidIdentifier(identifier: string): boolean {
    // PostgreSQL identifier rules:
    // - Must start with letter or underscore
    // - Can contain letters, digits, underscores
    // - Max 63 characters
    const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
    return identifierRegex.test(identifier);
  }

  /**
   * Sanitize identifier for safe use
   */
  static sanitizeIdentifier(identifier: string): string {
    // Remove any characters that aren't alphanumeric or underscore
    const sanitized = identifier.replace(/[^a-zA-Z0-9_]/g, '');

    // Ensure it starts with letter or underscore
    if (!/^[a-zA-Z_]/.test(sanitized)) {
      return `_${sanitized}`;
    }

    // Truncate to max length
    return sanitized.substring(0, 63);
  }

  /**
   * Throw error if validation fails
   */
  static throwIfInvalid(result: ValidationResult): void {
    if (!result.valid) {
      throw QueryBuilderError.validationFailed(result.errors);
    }
  }
}
