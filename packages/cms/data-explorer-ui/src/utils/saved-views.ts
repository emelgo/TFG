/**
 * Conversión entre las vistas guardadas y el estado del listado en la URL.
 *
 * Una vista guardada (`cms.saved_views`) almacena en `config` los filtros, la
 * ordenación y la búsqueda de un listado para volver a él con un clic o
 * compartirlo con otros roles. Los filtros se guardan con los operadores de
 * la API (`lt`, `gte`…), los mismos que la URL, de modo que cargar una vista
 * es copiar su configuración a la URL y detectar cambios es comparar ambas.
 *
 * Las vistas antiguas pueden traer los valores como número o booleano y
 * operadores de fecha de la interfaz (`before`); aquí se normalizan.
 */
import { mapDateOperator } from '@pymekit/cms-filters/utils';
import type { CmsSavedView, SavedViewInput } from '@pymekit/cms-ui-core/api';

import type { DataExplorerSearch } from './search-schema';

type SavedViewConfig = SavedViewInput['config'];

/** Lee `config` de una vista tolerando formas incompletas. */
function readConfig(view: Pick<CmsSavedView, 'config'>): SavedViewConfig {
  const config = (view.config ?? {}) as Partial<SavedViewConfig>;

  return {
    filters: Array.isArray(config.filters) ? config.filters : [],
    sort: config.sort,
    search: config.search,
  };
}

/** Convierte los filtros de una vista a la forma de la URL. */
function configFiltersToParams(config: SavedViewConfig) {
  const params: Record<string, string> = {};

  for (const filter of config.filters) {
    const first = filter.values?.[0];

    if (!filter.name || !first) {
      continue;
    }

    const value = first.value;

    if (value === null || value === undefined || value === '') {
      continue;
    }

    const operator = mapDateOperator(first.operator || 'eq');

    params[`${filter.name}.${operator}`] =
      value instanceof Date ? value.toISOString() : String(value);
  }

  return params;
}

/**
 * Devuelve la URL que corresponde a una vista guardada (y la marca como
 * activa con `view`). Se empieza siempre por la primera página.
 */
export function savedViewToSearch(
  view: Pick<CmsSavedView, 'id' | 'config'>,
  previous: DataExplorerSearch = {},
): DataExplorerSearch {
  const config = readConfig(view);
  const filters = configFiltersToParams(config);

  return {
    pageSize: previous.pageSize,
    view: view.id,
    search: config.search || undefined,
    sortColumn: config.sort?.column || undefined,
    sortDirection: config.sort?.column
      ? (config.sort.direction ?? 'asc')
      : undefined,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
}

/**
 * Construye la configuración de una vista a partir de la URL actual. Solo se
 * guarda lo esencial de cada filtro (columna, operador y valor), nunca el
 * metadato de la columna, que puede cambiar.
 */
export function searchToSavedViewConfig(
  search: DataExplorerSearch,
): SavedViewConfig {
  const byColumn = new Map<
    string,
    Array<{ operator: string; value: unknown }>
  >();

  for (const [key, value] of Object.entries(search.filters ?? {})) {
    const index = key.lastIndexOf('.');
    const name = index > 0 ? key.slice(0, index) : key;
    const operator = index > 0 ? key.slice(index + 1) : 'eq';

    byColumn.set(name, [...(byColumn.get(name) ?? []), { operator, value }]);
  }

  const config: SavedViewConfig = {
    filters: Array.from(byColumn, ([name, values]) => ({ name, values })),
  };

  if (search.sortColumn) {
    config.sort = {
      column: search.sortColumn,
      direction: search.sortDirection ?? 'asc',
    };
  }

  if (search.search) {
    config.search = search.search;
  }

  return config;
}

/**
 * Indica si la URL actual se ha alejado de la vista activa (otros filtros,
 * orden o búsqueda), para ofrecer «Actualizar vista».
 */
export function isSavedViewDirty(
  view: Pick<CmsSavedView, 'id' | 'config'>,
  search: DataExplorerSearch,
) {
  const saved = savedViewToSearch(view);

  const normalize = (value: DataExplorerSearch) =>
    JSON.stringify({
      filters: Object.entries(value.filters ?? {}).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
      search: value.search ?? '',
      sortColumn: value.sortColumn ?? '',
      sortDirection: value.sortColumn ? (value.sortDirection ?? 'asc') : '',
    });

  return normalize(saved) !== normalize(search);
}
