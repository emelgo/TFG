/**
 * Estado del listado de una tabla en la URL (*search params*).
 *
 * Todo lo que define qué filas se ven —página, tamaño de página, búsqueda,
 * ordenación, filtros y vista guardada activa— vive en la URL y no en estado
 * de React. Así un listado filtrado se puede compartir o guardar en
 * marcadores, el botón «atrás» deshace el último cambio y el `loader` de la
 * ruta puede pedir los datos antes de pintar (también en el SSR).
 *
 * La ruta `/admin/cms/resources/$schema/$table/` valida la URL con
 * `DataExplorerSearchSchema` (`validateSearch`). TanStack Router intenta
 * interpretar cada parámetro como JSON, así que `?search=123` llega como
 * número: por eso los textos aceptan número o booleano y se convierten a
 * cadena. Los valores no válidos se descartan (`.catch`) en lugar de romper
 * la página.
 *
 * Ejemplo: `?page=2&sortColumn=name&sortDirection=asc&filters={"name.contains":"ana"}`
 */
import * as z from 'zod';

import type { FilterUrlState } from '@pymekit/cms-filters/types';
import type { TableDataParams } from '@pymekit/cms-ui-core/api';

/** Tamaño de página máximo que acepta la API. */
export const MAX_PAGE_SIZE = 500;

const TextParam = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => String(value));

export const DataExplorerSearchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .optional()
    .catch(undefined),
  search: TextParam.optional().catch(undefined),
  sortColumn: TextParam.optional().catch(undefined),
  sortDirection: z.enum(['asc', 'desc']).optional().catch(undefined),
  view: TextParam.optional().catch(undefined),
  /** Filtros con el formato de la API: `{ "columna.operador": "valor" }`. */
  filters: z.record(z.string(), TextParam).optional().catch(undefined),
});

export type DataExplorerSearch = z.output<typeof DataExplorerSearchSchema>;

/** Parámetros de la consulta del listado para una tabla y su URL. */
export function toTableDataParams(
  schema: string,
  table: string,
  search: DataExplorerSearch,
): TableDataParams {
  return {
    schema,
    table,
    page: search.page,
    pageSize: search.pageSize,
    search: search.search || undefined,
    sortColumn: search.sortColumn,
    sortDirection: search.sortColumn ? search.sortDirection : undefined,
    filters:
      search.filters && Object.keys(search.filters).length > 0
        ? search.filters
        : undefined,
  };
}

/** Extrae de la URL el estado que gestiona el sistema de filtros. */
export function searchToFilterState(
  search: DataExplorerSearch,
): FilterUrlState {
  return {
    filters: search.filters ?? {},
    sortColumn: search.sortColumn,
    sortDirection: search.sortDirection,
    search: search.search,
    view: search.view,
  };
}

/**
 * Construye la nueva URL a partir del estado de los filtros. Cualquier cambio
 * de filtros, orden o búsqueda vuelve a la primera página (la página 7 de un
 * resultado distinto no tiene sentido); el tamaño de página se conserva.
 */
export function filterStateToSearch(
  state: FilterUrlState,
  previous: DataExplorerSearch,
): DataExplorerSearch {
  const hasFilters = Object.keys(state.filters).length > 0;

  return {
    pageSize: previous.pageSize,
    search: state.search || undefined,
    sortColumn: state.sortColumn || undefined,
    sortDirection: state.sortColumn ? state.sortDirection : undefined,
    view: state.view || undefined,
    filters: hasFilters ? state.filters : undefined,
  };
}

/**
 * Siguiente orden al pulsar la cabecera de una columna: la primera vez
 * ascendente; si ya se ordenaba por ella, se invierte el sentido.
 */
export function getNextSort(search: DataExplorerSearch, column: string) {
  const isSameColumn = search.sortColumn === column;

  return {
    sortColumn: column,
    sortDirection:
      isSameColumn && search.sortDirection !== 'desc'
        ? ('desc' as const)
        : ('asc' as const),
  };
}
