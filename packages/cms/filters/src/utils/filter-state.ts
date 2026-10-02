/**
 * Operaciones puras sobre la lista de filtros de la interfaz.
 *
 * El *hook* `useFilterState` las usa para calcular el nuevo estado sin mutar
 * el anterior; al ser funciones puras se prueban de forma aislada
 * (`__tests__/filter-state.test.ts`).
 */
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

import type { FilterItem, FilterValue } from '../types';

/**
 * Indica si un filtro tiene un valor aplicable (no nulo ni cadena vacía).
 * Los filtros sin valor son borradores: existen en la interfaz mientras el
 * usuario los edita, pero no se envían a la API.
 */
export function hasValidValue(filter: FilterItem) {
  const value = filter.values[0]?.value;

  if (value === null || value === undefined) {
    return false;
  }

  return !(typeof value === 'string' && value.trim() === '');
}

/** Crea un filtro vacío (operador «es igual a») para una columna. */
export function createFilterItem(
  column: ColumnMetadata,
  relations: RelationConfig[],
): FilterItem {
  return {
    ...column,
    values: [{ operator: 'eq', value: null }],
    relations: relations.filter((r) => r.source_column === column.name),
  };
}

/** Sustituye el valor del filtro de una columna. */
export function updateFilterValue(
  filters: FilterItem[],
  column: ColumnMetadata,
  filterValue: FilterValue,
): FilterItem[] {
  return filters.map((f) =>
    f.name === column.name ? { ...f, values: [filterValue] } : f,
  );
}

/** Quita el filtro de una columna. */
export function removeFilter(filters: FilterItem[], columnName: string) {
  return filters.filter((f) => f.name !== columnName);
}

/** Añade un filtro vacío para la columna, salvo que ya exista. */
export function addFilter(
  filters: FilterItem[],
  column: ColumnMetadata,
  relations: RelationConfig[],
): FilterItem[] {
  if (filters.some((f) => f.name === column.name)) {
    return filters;
  }

  return [...filters, createFilterItem(column, relations)];
}

/** Sustituye un filtro completo (por ejemplo, al cambiar de operador). */
export function updateFilter(filters: FilterItem[], updated: FilterItem) {
  return filters.map((f) => (f.name === updated.name ? updated : f));
}

/** Columnas por las que se puede ordenar. */
export function getSortableColumns(columns: ColumnMetadata[]) {
  return columns.filter((col) => col.is_sortable);
}
