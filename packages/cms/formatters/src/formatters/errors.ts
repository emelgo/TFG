/**
 * Structured error system for formatters
 */

/**
 * Error codes for different formatter error types
 */
export enum FormatterErrorCode {
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_CONFIG = 'MISSING_CONFIG',
  UNSUPPORTED_CONFIG_OPTION = 'UNSUPPORTED_CONFIG_OPTION',

  // Formatter registration errors
  FORMATTER_NOT_FOUND = 'FORMATTER_NOT_FOUND',
  FORMATTER_REGISTRATION_FAILED = 'FORMATTER_REGISTRATION_FAILED',
  DUPLICATE_FORMATTER = 'DUPLICATE_FORMATTER',

  // Value processing errors
  INVALID_VALUE = 'INVALID_VALUE',
  CONVERSION_FAILED = 'CONVERSION_FAILED',
  FORMAT_FAILED = 'FORMAT_FAILED',

  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONTEXT_ERROR = 'CONTEXT_ERROR',
}

/**
 * Structured error class for formatter errors
 */
export class FormatterError extends Error {
  readonly code: FormatterErrorCode;
  readonly context: Record<string, unknown>;
  readonly timestamp: Date;

  constructor(
    code: FormatterErrorCode,
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message);
    this.name = 'FormatterError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.cause = cause;
  }

  /**
   * Create a user-friendly error message
   */
  toUserMessage(): string {
    switch (this.code) {
      case FormatterErrorCode.INVALID_CONFIG:
        return 'Invalid formatter configuration provided';

      case FormatterErrorCode.FORMATTER_NOT_FOUND:
        return `Formatter "${this.context['formatterType']}" not found`;

      case FormatterErrorCode.INVALID_VALUE:
        return 'Value cannot be formatted with the selected formatter';

      case FormatterErrorCode.CONVERSION_FAILED:
        return 'Failed to convert value to required format';

      case FormatterErrorCode.FORMAT_FAILED:
        return 'Formatting operation failed';

      default:
        return 'An error occurred while formatting the value';
    }
  }

  /**
   * Convert to JSON for logging/debugging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Factory class for creating formatter errors
 */
export class FormatterErrorFactory {
  /**
   * Create an invalid configuration error
   */
  static invalidConfig(
    details: string,
    config?: unknown,
    validationErrors?: string[],
  ): FormatterError {
    return new FormatterError(
      FormatterErrorCode.INVALID_CONFIG,
      `Invalid formatter configuration: ${details}`,
      { config, validationErrors },
    );
  }

  /**
   * Create a formatter not found error
   */
  static formatterNotFound(formatterType: string): FormatterError {
    return new FormatterError(
      FormatterErrorCode.FORMATTER_NOT_FOUND,
      `No formatter registered for type: ${formatterType}`,
      { formatterType },
    );
  }

  /**
   * Create an invalid value error
   */
  static invalidValue(
    value: unknown,
    formatterType: string,
    expectedType?: string,
  ): FormatterError {
    return new FormatterError(
      FormatterErrorCode.INVALID_VALUE,
      `Invalid value for ${formatterType} formatter${expectedType ? `. Expected ${expectedType}` : ''}`,
      { value, formatterType, expectedType },
    );
  }

  /**
   * Create a conversion failed error
   */
  static conversionFailed(
    value: unknown,
    fromType: string,
    toType: string,
    cause?: Error,
  ): FormatterError {
    return new FormatterError(
      FormatterErrorCode.CONVERSION_FAILED,
      `Failed to convert value from ${fromType} to ${toType}`,
      { value, fromType, toType },
      cause,
    );
  }

  /**
   * Create a format failed error
   */
  static formatFailed(
    value: unknown,
    formatterType: string,
    cause?: Error,
  ): FormatterError {
    return new FormatterError(
      FormatterErrorCode.FORMAT_FAILED,
      `Failed to format value with ${formatterType} formatter`,
      { value, formatterType },
      cause,
    );
  }

  /**
   * Create an internal error
   */
  static internal(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ): FormatterError {
    return new FormatterError(
      FormatterErrorCode.INTERNAL_ERROR,
      message,
      context || {},
      cause,
    );
  }
}

/**
 * Error handler utility for formatters
 */
export class FormatterErrorHandler {
  private static logError(error: FormatterError): void {
    // In a real application, this would integrate with your logging system
    console.error('[FormatterError]', error.toJSON());
  }

  /**
   * Handle a formatter error and return a safe fallback result
   */
  static handle(
    error: FormatterError | Error,
    fallbackValue?: string,
  ): { formatted: string; error: string } {
    const formatterError =
      error instanceof FormatterError
        ? error
        : FormatterErrorFactory.internal(
            'Unknown error occurred',
            {},
            error as Error,
          );

    this.logError(formatterError);

    return {
      formatted: fallbackValue ?? String(formatterError.context['value'] ?? ''),
      error: formatterError.toUserMessage(),
    };
  }

  /**
   * Create a safe formatter function that handles errors gracefully
   */
  static wrapFormatter<T, C>(
    formatter: (value: T, config?: C) => string,
  ): (value: T, config?: C) => { formatted: string; error?: string } {
    return (value: T, config?: C) => {
      try {
        return {
          formatted: formatter(value, config),
        };
      } catch (error) {
        const result = this.handle(error as Error, String(value));
        return {
          formatted: result.formatted,
          error: result.error,
        };
      }
    };
  }
}
