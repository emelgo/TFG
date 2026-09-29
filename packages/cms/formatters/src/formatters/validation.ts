/**
 * Runtime validation schemas for formatter configurations
 */
import { z } from 'zod';

// Base formatter configuration schema
const baseFormatterConfigSchema = z.object({
  locale: z.string().optional(),
  timezone: z.string().optional(),
});

// Number formatter configuration schema
export const numberFormatterConfigSchema = baseFormatterConfigSchema
  .extend({
    type: z.enum([
      'number',
      'currency',
      'percentage',
      'decimal',
      'compact',
      'scientific',
      'engineering',
    ]),
    minimumFractionDigits: z.number().min(0).max(20).optional(),
    maximumFractionDigits: z.number().min(0).max(20).optional(),
    minimumIntegerDigits: z.number().min(1).max(21).optional(),
    currency: z.string().optional(), // Allow any currency string for now
    currencyDisplay: z
      .enum(['symbol', 'narrowSymbol', 'code', 'name'])
      .optional(),
    notation: z
      .enum(['standard', 'scientific', 'engineering', 'compact'])
      .optional(),
    compactDisplay: z.enum(['short', 'long']).optional(),
    useGrouping: z.boolean().optional(),
    roundingMode: z
      .enum([
        'ceil',
        'floor',
        'expand',
        'trunc',
        'halfCeil',
        'halfFloor',
        'halfExpand',
        'halfTrunc',
        'halfEven',
      ])
      .optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
  })
  .catchall(z.unknown()); // Allow any additional properties

// Date formatter configuration schema
export const dateFormatterConfigSchema = baseFormatterConfigSchema
  .extend({
    type: z.enum(['date', 'time', 'datetime', 'relative', 'custom']),
    dateStyle: z.enum(['full', 'long', 'medium', 'short']).optional(),
    timeStyle: z.enum(['full', 'long', 'medium', 'short']).optional(),
    format: z.string().optional(), // Custom format string
    relativeStyle: z.enum(['long', 'short', 'narrow']).optional(),
    includeTime: z.boolean().optional(),
  })
  .catchall(z.unknown());

// Text formatter configuration schema
export const textFormatterConfigSchema = baseFormatterConfigSchema
  .extend({
    type: z.enum([
      'text',
      'email',
      'url',
      'phone',
      'truncate',
      'capitalize',
      'uppercase',
      'lowercase',
    ]),
    maxLength: z.number().min(1).optional(),
    truncatePosition: z.enum(['start', 'middle', 'end']).optional(),
    linkify: z.boolean().optional(),
    preserveWhitespace: z.boolean().optional(),
  })
  .catchall(z.unknown());

// Boolean formatter configuration schema
export const booleanFormatterConfigSchema = baseFormatterConfigSchema
  .extend({
    type: z.literal('boolean'),
    trueLabel: z.string().optional(),
    falseLabel: z.string().optional(),
    nullLabel: z.string().optional(),
    format: z.enum(['text', 'icon', 'badge']).optional(),
  })
  .catchall(z.unknown());

// Custom formatter configuration schema (flexible)
export const customFormatterConfigSchema = baseFormatterConfigSchema
  .extend({
    type: z.string().min(1),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown()); // Allow any additional properties

// Known formatter types union
const knownFormatterConfigSchema = z.discriminatedUnion('type', [
  numberFormatterConfigSchema,
  dateFormatterConfigSchema,
  textFormatterConfigSchema,
  booleanFormatterConfigSchema,
]);

// Union schema for all formatter configurations
export const formatterConfigSchema = z.union([
  knownFormatterConfigSchema,
  customFormatterConfigSchema,
]);

// Column formatting configuration schema
export const columnFormattingConfigSchema = z
  .object({
    columnName: z.string().min(1),
    dataType: z.string().optional(),
    nullable: z.boolean().optional(),
    precision: z.number().min(0).optional(),
    scale: z.number().min(0).optional(),
    type: z.string().optional(),
    locale: z.string().optional(),
    timezone: z.string().optional(),
  })
  .catchall(z.unknown());

/**
 * Validation utilities
 */
export class FormatterConfigValidator {
  /**
   * Validate a formatter configuration
   */
  static validate(
    config: unknown,
  ):
    | { success: true; data: z.infer<typeof formatterConfigSchema> }
    | { success: false; error: z.ZodError } {
    const result = formatterConfigSchema.safeParse(config);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return { success: false, error: result.error };
  }

  /**
   * Validate and return a specific formatter configuration type
   */
  static validateNumberConfig(config: unknown) {
    return numberFormatterConfigSchema.safeParse(config);
  }

  static validateDateConfig(config: unknown) {
    return dateFormatterConfigSchema.safeParse(config);
  }

  static validateTextConfig(config: unknown) {
    return textFormatterConfigSchema.safeParse(config);
  }

  static validateBooleanConfig(config: unknown) {
    return booleanFormatterConfigSchema.safeParse(config);
  }

  static validateCustomConfig(config: unknown) {
    return customFormatterConfigSchema.safeParse(config);
  }

  /**
   * Validate column formatting configuration
   */
  static validateColumnConfig(config: unknown) {
    return columnFormattingConfigSchema.safeParse(config);
  }

  /**
   * Get user-friendly validation errors
   */
  static getValidationErrors(error: z.ZodError): string[] {
    return error.issues.map((err) => {
      const path = err.path.length > 0 ? `${err.path.join('.')}: ` : '';
      return `${path}${err.message}`;
    });
  }

  /**
   * Check if a configuration is valid without throwing
   */
  static isValid(
    config: unknown,
  ): config is z.infer<typeof formatterConfigSchema> {
    return formatterConfigSchema.safeParse(config).success;
  }
}

/**
 * Type guards for formatter configurations
 */
export const isNumberFormatterConfig = (
  config: unknown,
): config is z.infer<typeof numberFormatterConfigSchema> => {
  return numberFormatterConfigSchema.safeParse(config).success;
};

export const isDateFormatterConfig = (
  config: unknown,
): config is z.infer<typeof dateFormatterConfigSchema> => {
  return dateFormatterConfigSchema.safeParse(config).success;
};

export const isTextFormatterConfig = (
  config: unknown,
): config is z.infer<typeof textFormatterConfigSchema> => {
  return textFormatterConfigSchema.safeParse(config).success;
};

export const isBooleanFormatterConfig = (
  config: unknown,
): config is z.infer<typeof booleanFormatterConfigSchema> => {
  return booleanFormatterConfigSchema.safeParse(config).success;
};

export const isCustomFormatterConfig = (
  config: unknown,
): config is z.infer<typeof customFormatterConfigSchema> => {
  return customFormatterConfigSchema.safeParse(config).success;
};
