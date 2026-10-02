import type { OperatorDefinition } from '../types';

const DATE_TYPES = [
  'date',
  'timestamp',
  'timestamp with time zone',
  'timestamp without time zone',
  'timestamptz',
];

const NUMBER_TYPES = [
  'integer',
  'bigint',
  'numeric',
  'real',
  'double precision',
  'smallint',
];

const JSON_TYPES = ['json', 'jsonb'];

const TEXT_TYPES = ['text', 'varchar', 'character varying', 'character'];

/**
 * Registry of all supported filter operators
 */
export const OPERATOR_REGISTRY: Record<string, OperatorDefinition> = {
  // Equality operators
  eq: {
    key: 'eq',
    sqlTemplate: '=',
    supportedTypes: ['all'],
    generateSql(column, value, _context) {
      if (value.isRange) {
        return `"${column}" BETWEEN ${value.start} AND ${value.end}`;
      }
      return `"${column}" = ${value.escaped}`;
    },
  },

  neq: {
    key: 'neq',
    sqlTemplate: '!=',
    supportedTypes: ['all'],
    generateSql(column, value, _context) {
      if (value.isRange) {
        return `"${column}" NOT BETWEEN ${value.start} AND ${value.end}`;
      }
      return `"${column}" != ${value.escaped}`;
    },
  },

  // Comparison operators
  gt: {
    key: 'gt',
    sqlTemplate: '>',
    supportedTypes: [...DATE_TYPES, ...NUMBER_TYPES],
    generateSql(column, value, _context) {
      return `"${column}" > ${value.escaped}`;
    },
  },

  gte: {
    key: 'gte',
    sqlTemplate: '>=',
    supportedTypes: [...DATE_TYPES, ...NUMBER_TYPES],
    generateSql(column, value, _context) {
      return `"${column}" >= ${value.escaped}`;
    },
  },

  lt: {
    key: 'lt',
    sqlTemplate: '<',
    supportedTypes: [...DATE_TYPES, ...NUMBER_TYPES],
    generateSql(column, value, _context) {
      return `"${column}" < ${value.escaped}`;
    },
  },

  lte: {
    key: 'lte',
    sqlTemplate: '<=',
    supportedTypes: [...DATE_TYPES, ...NUMBER_TYPES],
    generateSql(column, value, _context) {
      return `"${column}" <= ${value.escaped}`;
    },
  },

  // Range operators
  between: {
    key: 'between',
    sqlTemplate: 'BETWEEN',
    supportedTypes: [...DATE_TYPES, ...NUMBER_TYPES],
    generateSql(column, value, _context) {
      if (value.isRange && value.start && value.end) {
        return `"${column}" BETWEEN ${value.start} AND ${value.end}`;
      }
      // Fallback for malformed between values
      return `"${column}" = ${value.escaped}`;
    },
  },

  notBetween: {
    key: 'notBetween',
    sqlTemplate: 'NOT BETWEEN',
    supportedTypes: [...DATE_TYPES, ...NUMBER_TYPES],
    generateSql(column, value, _context) {
      if (value.isRange && value.start && value.end) {
        return `"${column}" NOT BETWEEN ${value.start} AND ${value.end}`;
      }
      return `"${column}" != ${value.escaped}`;
    },
  },

  // Text operators
  contains: {
    key: 'contains',
    sqlTemplate: 'ILIKE',
    supportedTypes: TEXT_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" ILIKE ${value.escaped}`;
    },
  },

  startsWith: {
    key: 'startsWith',
    sqlTemplate: 'ILIKE',
    supportedTypes: TEXT_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" ILIKE ${value.escaped}`;
    },
  },

  endsWith: {
    key: 'endsWith',
    sqlTemplate: 'ILIKE',
    supportedTypes: TEXT_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" ILIKE ${value.escaped}`;
    },
  },

  // Array operators
  in: {
    key: 'in',
    sqlTemplate: 'IN',
    needsWrapping: true,
    supportedTypes: ['all'],
    generateSql(column, value, _context) {
      // Handle array values for IN operator
      let processedValue = value.escaped;

      if (Array.isArray(value.original)) {
        const escapedValues = value.original
          .map((v) =>
            typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v),
          )
          .join(', ');

        processedValue = escapedValues;
      }

      return `"${column}" IN (${processedValue})`;
    },
  },

  notIn: {
    key: 'notIn',
    sqlTemplate: 'NOT IN',
    needsWrapping: true,
    supportedTypes: ['all'],
    generateSql(column, value, _context) {
      // Handle array values for NOT IN operator
      let processedValue = value.escaped;
      if (Array.isArray(value.original)) {
        const escapedValues = value.original
          .map((v) =>
            typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v),
          )
          .join(', ');
        processedValue = escapedValues;
      }
      return `"${column}" NOT IN (${processedValue})`;
    },
  },

  // Null operators
  isNull: {
    key: 'isNull',
    sqlTemplate: 'IS NULL',
    supportedTypes: ['all'],
    generateSql(column, _value, _context) {
      return `"${column}" IS NULL`;
    },
  },

  notNull: {
    key: 'notNull',
    sqlTemplate: 'IS NOT NULL',
    supportedTypes: ['all'],
    generateSql(column, _value, _context) {
      return `"${column}" IS NOT NULL`;
    },
  },

  // Date-specific operators (mapped to comparison operators)
  before: {
    key: 'before',
    sqlTemplate: '<',
    supportedTypes: DATE_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" < ${value.escaped}`;
    },
  },

  beforeOrOn: {
    key: 'beforeOrOn',
    sqlTemplate: '<=',
    supportedTypes: DATE_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" <= ${value.escaped}`;
    },
  },

  after: {
    key: 'after',
    sqlTemplate: '>',
    supportedTypes: DATE_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" > ${value.escaped}`;
    },
  },

  afterOrOn: {
    key: 'afterOrOn',
    sqlTemplate: '>=',
    supportedTypes: DATE_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" >= ${value.escaped}`;
    },
  },

  during: {
    key: 'during',
    sqlTemplate: 'BETWEEN',
    supportedTypes: DATE_TYPES,
    generateSql(column, value, _context) {
      if (value.isRange && value.start && value.end) {
        return `"${column}" BETWEEN ${value.start} AND ${value.end}`;
      }
      return `"${column}" = ${value.escaped}`;
    },
  },

  // JSON operators
  hasKey: {
    key: 'hasKey',
    sqlTemplate: '?',
    supportedTypes: JSON_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" ? ${value.escaped}`;
    },
  },

  keyEquals: {
    key: 'keyEquals',
    sqlTemplate: '@>',
    supportedTypes: JSON_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" @> ${value.escaped}`;
    },
  },

  pathExists: {
    key: 'pathExists',
    sqlTemplate: '#>',
    supportedTypes: JSON_TYPES,
    generateSql(column, value, _context) {
      return `"${column}" #> ${value.escaped} IS NOT NULL`;
    },
  },

  containsText: {
    key: 'containsText',
    sqlTemplate: 'ILIKE',
    supportedTypes: JSON_TYPES,
    generateSql(column, value, _context) {
      return `"${column}"::text ILIKE ${value.escaped}`;
    },
  },
};

/**
 * Get operator definition by key
 */
export function getOperator(key: string): OperatorDefinition {
  return OPERATOR_REGISTRY[key] || OPERATOR_REGISTRY['eq']!;
}

/**
 * Get all supported operators for a data type
 */
export function getOperatorsForDataType(dataType: string): string[] {
  const normalizedType = dataType.toLowerCase();

  return Object.values(OPERATOR_REGISTRY)
    .filter(
      (op) =>
        op.supportedTypes.includes('all') ||
        op.supportedTypes.some((type) => normalizedType.includes(type)),
    )
    .map((op) => op.key);
}
