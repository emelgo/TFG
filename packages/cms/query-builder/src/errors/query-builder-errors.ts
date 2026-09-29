/**
 * Query builder error handling
 */

/**
 * Error codes for query builder operations
 */
export enum QueryBuilderErrorCode {
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_AGGREGATION = 'INVALID_AGGREGATION',
  INVALID_JOIN = 'INVALID_JOIN',
  INVALID_WHERE = 'INVALID_WHERE',
  INVALID_TIME_INTERVAL = 'INVALID_TIME_INTERVAL',
  SQL_INJECTION_RISK = 'SQL_INJECTION_RISK',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_COLUMN = 'INVALID_COLUMN',
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  INVALID_TABLE = 'INVALID_TABLE',
  INVALID_WIDGET_TYPE = 'INVALID_WIDGET_TYPE',
  UNAUTHORIZED_SCHEMA = 'UNAUTHORIZED_SCHEMA',
  UNAUTHORIZED_TABLE = 'UNAUTHORIZED_TABLE',
  QUERY_EXECUTION_ERROR = 'QUERY_EXECUTION_ERROR',
  MISSING_REQUIRED_CONFIG = 'MISSING_REQUIRED_CONFIG',
}

/**
 * Custom error class for query builder operations
 */
export class QueryBuilderError extends Error {
  public readonly code: QueryBuilderErrorCode;
  public readonly details?: unknown;

  constructor(code: QueryBuilderErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'QueryBuilderError';
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QueryBuilderError);
    }
  }

  /**
   * Create error for invalid configuration
   */
  static invalidConfiguration(
    message: string,
    details?: unknown,
  ): QueryBuilderError {
    return new QueryBuilderError(
      QueryBuilderErrorCode.INVALID_CONFIGURATION,
      message,
      details,
    );
  }

  /**
   * Create error for missing required field
   */
  static missingRequiredField(
    field: string,
    context?: string,
  ): QueryBuilderError {
    const message = context
      ? `Missing required field '${field}' in ${context}`
      : `Missing required field '${field}'`;

    return new QueryBuilderError(
      QueryBuilderErrorCode.MISSING_REQUIRED_FIELD,
      message,
      { field, context },
    );
  }

  /**
   * Create error for invalid aggregation
   */
  static invalidAggregation(
    aggregation: string,
    reason: string,
  ): QueryBuilderError {
    return new QueryBuilderError(
      QueryBuilderErrorCode.INVALID_AGGREGATION,
      `Invalid aggregation '${aggregation}': ${reason}`,
      { aggregation, reason },
    );
  }

  /**
   * Create error for invalid JOIN
   */
  static invalidJoin(reason: string, details?: unknown): QueryBuilderError {
    return new QueryBuilderError(
      QueryBuilderErrorCode.INVALID_JOIN,
      `Invalid JOIN clause: ${reason}`,
      details,
    );
  }

  /**
   * Create error for SQL injection risk
   */
  static sqlInjectionRisk(field: string, value: string): QueryBuilderError {
    return new QueryBuilderError(
      QueryBuilderErrorCode.SQL_INJECTION_RISK,
      `Potential SQL injection detected in ${field}`,
      { field, value },
    );
  }

  /**
   * Create error for validation failure
   */
  static validationFailed(errors: string[]): QueryBuilderError {
    return new QueryBuilderError(
      QueryBuilderErrorCode.VALIDATION_FAILED,
      `Query validation failed: ${errors.join(', ')}`,
      { errors },
    );
  }
}
