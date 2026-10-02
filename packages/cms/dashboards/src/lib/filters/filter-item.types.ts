/**
 * Tipos de filtro compartidos entre el servidor de paneles y la futura
 * interfaz de filtros del CMS.
 *
 * En el código original vivían en el paquete de filtros de la interfaz
 * (React). Como la API de paneles solo necesita su forma, se extraen aquí para
 * que el servidor no dependa de un paquete de componentes. [TFG] ADR-011
 */
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

/** Valor concreto de un filtro aplicado a una columna. */
export type FilterValue<Config = Record<string, unknown>> = {
  operator: string;
  value: string | boolean | number | Date | null;
  label?: string;
  isRelativeDate?: boolean;
  relativeDateOption?: RelativeDateOption;
  config?: Config;
};

/** Opciones de fecha relativa que admite un filtro. */
export type RelativeDateOption =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'thisWeek'
  | 'lastWeek'
  | 'nextWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'nextMonth'
  | 'last7Days'
  | 'next7Days'
  | 'last30Days'
  | 'next30Days'
  | 'thisYear'
  | 'lastYear'
  | 'custom';

/** Columna con los valores de filtro que se le aplican. */
export type FilterItem = ColumnMetadata & {
  values: FilterValue[];
  relations?: RelationConfig[];
};

/** Operadores de filtro que entiende el constructor de consultas. */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'notIn'
  | 'isNull'
  | 'notNull'
  | 'between'
  | 'notBetween'
  | 'before'
  | 'beforeOrOn'
  | 'after'
  | 'afterOrOn'
  | 'during'
  | 'containsText'
  | 'hasKey'
  | 'keyEquals'
  | 'pathExists';
