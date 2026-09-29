/**
 * Operadores de filtro disponibles según el tipo de dato de la columna.
 *
 * La interfaz solo ofrece los operadores que tienen sentido para cada tipo
 * (no se puede pedir «contiene» a un número). Para las fechas se usan nombres
 * propios («antes de», «después de»…) que se traducen a los operadores SQL
 * equivalentes al guardarlos en la URL (`mapDateOperator`) y se recuperan al
 * leerla (`mapSqlToDateOperator`).
 */
import { isDateDataType } from '../constants';
import type { FilterOperator } from '../types';

export const textOperators = [
  'eq',
  'neq',
  'contains',
  'startsWith',
  'endsWith',
  'isNull',
  'notNull',
] satisfies FilterOperator[];

export const numericOperators = [
  'eq',
  'neq',
  'lt',
  'lte',
  'gt',
  'gte',
  'between',
  'notBetween',
] satisfies FilterOperator[];

export const dateOperators = [
  'eq',
  'neq',
  'before',
  'beforeOrOn',
  'after',
  'afterOrOn',
  'between',
  'notBetween',
] satisfies FilterOperator[];

export const jsonOperators = [
  'eq',
  'neq',
  'containsText',
  'hasKey',
  'keyEquals',
  'pathExists',
  'isNull',
  'notNull',
] satisfies FilterOperator[];

/** Operadores por tipo de dato de PostgreSQL. */
export const operatorMap: Record<string, FilterOperator[]> = {
  text: textOperators,
  'character varying': textOperators,
  integer: numericOperators,
  bigint: numericOperators,
  smallint: numericOperators,
  numeric: numericOperators,
  real: numericOperators,
  'double precision': numericOperators,
  boolean: ['eq', 'isNull', 'notNull'],
  date: dateOperators,
  timestamp: dateOperators,
  'timestamp with time zone': dateOperators,
  uuid: ['eq', 'neq', 'isNull', 'notNull'],
  enum: ['eq', 'neq', 'isNull', 'notNull'],
  json: jsonOperators,
  jsonb: jsonOperators,
  default: ['eq', 'neq', 'isNull', 'notNull'],
};

/**
 * Traduce un operador de fecha de la interfaz a su operador SQL
 * (`before` → `lt`…). El resto se devuelve igual.
 */
export function mapDateOperator(operator: string): string {
  switch (operator) {
    case 'before':
      return 'lt';
    case 'beforeOrOn':
      return 'lte';
    case 'after':
      return 'gt';
    case 'afterOrOn':
      return 'gte';
    case 'during':
      return 'eq';
    default:
      return operator;
  }
}

/**
 * Devuelve los operadores que admite un tipo de dato. Las columnas con
 * valores enumerados solo admiten igualdad y nulos.
 */
export function getOperatorsForDataType(
  dataType: string,
  isEnum?: boolean,
): FilterOperator[] {
  if (isEnum) {
    return operatorMap['enum'] ?? [];
  }

  return operatorMap[dataType?.toLowerCase()] ?? operatorMap['default'] ?? [];
}

/**
 * Operación inversa de `mapDateOperator` para mostrar los operadores SQL de
 * la URL con la terminología de fechas. Solo afecta a columnas de fecha.
 */
export function mapSqlToDateOperator(operator: string, dataType: string) {
  if (!isDateDataType(dataType)) {
    return operator;
  }

  switch (operator) {
    case 'lt':
      return 'before';
    case 'lte':
      return 'beforeOrOn';
    case 'gt':
      return 'after';
    case 'gte':
      return 'afterOrOn';
    case 'eq':
      return 'during';
    default:
      return operator;
  }
}
