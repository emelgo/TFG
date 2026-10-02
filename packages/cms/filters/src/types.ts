/**
 * Tipos del sistema de filtros del explorador de datos del CMS.
 *
 * Un filtro (`FilterItem`) es el metadato de una columna más el valor que el
 * usuario ha elegido para ella (`values[0]`: operador y valor). En la URL y en
 * la API cada filtro viaja como una pareja `"columna.operador": "valor"`; estos
 * tipos describen su forma enriquecida para la interfaz (etiquetas legibles,
 * fechas relativas…).
 */
import type { RelativeDateOption } from '@pymekit/cms-filters-core';
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

export type { RelativeDateOption };

/** Valor de un filtro: operador, valor y etiqueta para mostrarlo. */
export type FilterValue = {
  operator: string;
  value: string | boolean | number | Date | null;
  label?: string;
  /** Indica que el valor es una fecha relativa (`__rel_date:today`…). */
  isRelativeDate?: boolean;
  relativeDateOption?: RelativeDateOption;
};

/** Filtro de la interfaz: columna, relaciones y valor elegido. */
export type FilterItem = ColumnMetadata & {
  values: FilterValue[];
  relations?: RelationConfig[];
};

export type SortDirection = 'asc' | 'desc';

export type SortState = {
  column: string | null;
  direction: SortDirection | null;
};

/** Operadores que ofrece la interfaz (y que entiende la API). */
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

/**
 * Etiqueta ya formateada de una relación de una fila (la devuelve la API junto
 * con los datos), para mostrar «Cuenta: Ana» en lugar del identificador.
 */
export type RelatedDataItem = {
  column: string;
  original: unknown;
  formatted: string | null | undefined;
  link: string | null | undefined;
};

/**
 * Estado de la URL que gestiona el sistema de filtros. Los filtros usan las
 * claves `"columna.operador"`; el resto son la ordenación, la búsqueda global
 * y la vista guardada activa.
 */
export type FilterUrlState = {
  filters: Record<string, string>;
  sortColumn?: string;
  sortDirection?: SortDirection;
  search?: string;
  view?: string;
};

/**
 * Adaptador entre el sistema de filtros y el lugar donde vive su estado. El
 * explorador de datos lo implementa sobre los *search params* de TanStack
 * Router; otras pantallas podrían guardarlo en memoria. `setState` sustituye
 * el estado completo (y, en la URL, vuelve a la primera página).
 */
export interface FilterStateAdapter {
  state: FilterUrlState;
  setState: (next: FilterUrlState) => void;
}
