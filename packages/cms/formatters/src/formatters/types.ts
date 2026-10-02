/**
 * Core types for the data formatting system
 */

// Base formatter configuration
export interface BaseFormatterConfig {
  locale?: string;
  timezone?: string;
}

// Number formatting types
export type NumberFormatType =
  | 'number'
  | 'currency'
  | 'percentage'
  | 'decimal'
  | 'compact'
  | 'scientific'
  | 'engineering';

export interface NumberFormatterConfig extends BaseFormatterConfig {
  type: NumberFormatType;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  minimumIntegerDigits?: number;
  currency?: string;
  currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
  notation?: 'standard' | 'scientific' | 'engineering' | 'compact';
  compactDisplay?: 'short' | 'long';
  useGrouping?: boolean;
  roundingMode?:
    | 'ceil'
    | 'floor'
    | 'expand'
    | 'trunc'
    | 'halfCeil'
    | 'halfFloor'
    | 'halfExpand'
    | 'halfTrunc'
    | 'halfEven';
  prefix?: string;
  suffix?: string;
}

// Date formatting types
export type DateFormatType =
  | 'date'
  | 'time'
  | 'datetime'
  | 'relative'
  | 'custom';

export interface DateFormatterConfig extends BaseFormatterConfig {
  type: DateFormatType;
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
  format?: string; // Custom format string (date-fns format)
  relativeStyle?: 'long' | 'short' | 'narrow';
  includeTime?: boolean;
}

// Text formatting types
export type TextFormatType =
  | 'text'
  | 'email'
  | 'url'
  | 'phone'
  | 'truncate'
  | 'capitalize'
  | 'uppercase'
  | 'lowercase';

export interface TextFormatterConfig extends BaseFormatterConfig {
  type: TextFormatType;
  maxLength?: number;
  truncatePosition?: 'start' | 'middle' | 'end';
  linkify?: boolean;
  preserveWhitespace?: boolean;
}

// Boolean formatting types
export interface BooleanFormatterConfig extends BaseFormatterConfig {
  type: 'boolean';
  trueLabel?: string;
  falseLabel?: string;
  nullLabel?: string;
  format?: 'text' | 'icon' | 'badge';
}

// Custom formatter configurations with improved type safety
export interface CustomFormatterConfig<
  T = Record<string, string | number | boolean | null>,
> extends BaseFormatterConfig {
  type: string; // Any string for custom formatters
  config?: T; // Type-safe configuration object
}

// Helper type for creating typed custom formatters
export type TypedCustomFormatterConfig<
  TType extends string,
  TConfig extends Record<string, string | number | boolean | null> = Record<
    string,
    string | number | boolean | null
  >,
> = BaseFormatterConfig & {
  type: TType;
  config?: TConfig;
};

// Union type for all formatter configs
export type FormatterConfig =
  | NumberFormatterConfig
  | DateFormatterConfig
  | TextFormatterConfig
  | BooleanFormatterConfig
  | CustomFormatterConfig;

// Formatter function type
export type FormatterFunction<
  T = unknown,
  C extends FormatterConfig = FormatterConfig,
> = (value: T, config?: C) => string;

// Formatter registry entry
export interface FormatterRegistryEntry<
  T = unknown,
  C extends FormatterConfig = FormatterConfig,
> {
  name: string;
  type: FormatterConfig['type'];
  formatter: FormatterFunction<T, C>;
  defaultConfig?: Partial<C>;
  supportedTypes?: string[]; // Database column types this formatter supports
}

// Translation function type
export type TranslationFunction = (
  key: string,
  options?: Record<string, unknown>,
) => string;

// Context for formatters (user preferences, etc.)
export interface FormatterContext {
  locale: string;
  timezone: string;
  currency: string;
  dateFormat?: string;
  timeFormat?: string;
  numberFormat?: Partial<NumberFormatterConfig>;
  // Optional translation function for i18n support
  t?: TranslationFunction;
}

// Column metadata integration
export interface ColumnFormattingConfig {
  columnName: string;
  dataType?: string;
  nullable?: boolean;
  precision?: number;
  scale?: number;
  // Optional formatting configuration
  type?: FormatterConfig['type'];
  locale?: string;
  timezone?: string;
  // Additional formatter-specific options can be added here
  [key: string]: string | number | boolean | null | undefined;
}

// Formatter result with metadata
export interface FormattedValue {
  raw: unknown;
  formatted: string;
  config: FormatterConfig;
  error?: string;
}

// Built-in formatter types
export const BUILT_IN_FORMATTERS = {
  // Numbers
  NUMBER: 'number',
  CURRENCY: 'currency',
  PERCENTAGE: 'percentage',
  DECIMAL: 'decimal',
  COMPACT: 'compact',
  SCIENTIFIC: 'scientific',

  // Dates
  DATE: 'date',
  TIME: 'time',
  DATETIME: 'datetime',
  RELATIVE: 'relative',

  // Text
  TEXT: 'text',
  EMAIL: 'email',
  URL: 'url',
  PHONE: 'phone',
  TRUNCATE: 'truncate',

  // Boolean
  BOOLEAN: 'boolean',
} as const;

export type BuiltInFormatterType =
  (typeof BUILT_IN_FORMATTERS)[keyof typeof BUILT_IN_FORMATTERS];
