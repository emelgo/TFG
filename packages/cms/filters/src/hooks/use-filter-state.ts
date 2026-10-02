/**
 * Estado de los filtros, la ordenación y la búsqueda del explorador de datos.
 *
 * La **fuente de verdad** es el adaptador de estado (en el explorador, los
 * *search params* de la URL): los filtros aplicados se derivan de él en cada
 * render, así que el botón «atrás» del navegador, un enlace compartido o una
 * vista guardada funcionan sin sincronizaciones adicionales.
 *
 * Además hay un estado local mínimo para lo que todavía no está aplicado:
 *
 *  - `drafts`: filtros que el usuario está editando (recién añadidos o con el
 *    operador cambiado y aún sin valor). Se muestran encima de los de la URL,
 *    pero no se envían a la API hasta que tienen un valor válido.
 *  - `openFilterName`: el filtro cuyo desplegable está abierto.
 *
 * Al derivar en lugar de copiar el estado de la URL no hace falta ningún
 * `useEffect` de sincronización (y se evitan sus bucles de renderizado).
 */
import { useCallback, useMemo, useState } from 'react';

import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

import type {
  FilterItem,
  FilterStateAdapter,
  FilterValue,
  RelatedDataItem,
  SortDirection,
} from '../types';
import {
  filtersToParams,
  parseFiltersFromParams,
} from '../utils/filter-params';
import {
  createFilterItem,
  hasValidValue,
  updateFilterValue,
} from '../utils/filter-state';
import { useFilterLabelFormatters } from './use-filter-labels';

export interface UseFilterStateProps {
  columns: ColumnMetadata[];
  relations: RelationConfig[];
  relatedData: RelatedDataItem[];
  stateAdapter: FilterStateAdapter;
}

/**
 * Devuelve los filtros actuales y las acciones para modificarlos, junto con
 * la ordenación y la búsqueda global.
 */
export function useFilterState({
  columns,
  relations,
  relatedData,
  stateAdapter,
}: UseFilterStateProps) {
  const formatters = useFilterLabelFormatters();
  const { state, setState } = stateAdapter;

  const [drafts, setDrafts] = useState<Record<string, FilterItem>>({});
  const [openFilterName, setOpenFilterName] = useState<string | null>(null);

  // Filtros aplicados, derivados de la URL.
  const appliedFilters = useMemo(
    () =>
      parseFiltersFromParams(
        state.filters,
        columns,
        relations,
        relatedData,
        formatters,
      ),
    [state.filters, columns, relations, relatedData, formatters],
  );

  // Lo que ve el usuario: los aplicados (con su borrador encima, si lo hay)
  // seguidos de los borradores de columnas que aún no tienen filtro.
  const filters = useMemo(() => {
    const applied = appliedFilters.map((f) => drafts[f.name] ?? f);

    const pending = Object.values(drafts).filter(
      (draft) => !appliedFilters.some((f) => f.name === draft.name),
    );

    return [...applied, ...pending];
  }, [appliedFilters, drafts]);

  const sortState = useMemo(
    () => ({
      column: state.sortColumn ?? null,
      direction: state.sortDirection ?? null,
    }),
    [state.sortColumn, state.sortDirection],
  );

  const commitFilters = useCallback(
    (nextFilters: FilterItem[]) => {
      setState({ ...state, filters: filtersToParams(nextFilters) });
    },
    [setState, state],
  );

  const dropDraft = useCallback((name: string) => {
    setDrafts((prev) => {
      if (!(name in prev)) {
        return prev;
      }

      const { [name]: _removed, ...rest } = prev;

      return rest;
    });
  }, []);

  const addFilter = useCallback(
    (column: ColumnMetadata) => {
      if (!filters.some((f) => f.name === column.name)) {
        setDrafts((prev) => ({
          ...prev,
          [column.name]: createFilterItem(column, relations),
        }));
      }

      setOpenFilterName(column.name);
    },
    [filters, relations],
  );

  const removeFilter = useCallback(
    (columnName: string) => {
      dropDraft(columnName);

      if (appliedFilters.some((f) => f.name === columnName)) {
        commitFilters(appliedFilters.filter((f) => f.name !== columnName));
      }
    },
    [appliedFilters, commitFilters, dropDraft],
  );

  const handleUpdateFilterValue = useCallback(
    (column: ColumnMetadata, filterValue: FilterValue, shouldClose = true) => {
      const current =
        filters.find((f) => f.name === column.name) ??
        createFilterItem(column, relations);

      const updated = { ...current, values: [filterValue] };

      // Un valor válido se aplica (va a la URL) y deja de ser borrador; uno
      // vacío (por ejemplo, un rango a medio rellenar) sigue siendo borrador.
      // Se parte de los filtros aplicados, no de los visibles, para no enviar
      // los borradores de otras columnas.
      if (hasValidValue(updated)) {
        const isApplied = appliedFilters.some((f) => f.name === column.name);

        dropDraft(column.name);
        commitFilters(
          isApplied
            ? updateFilterValue(appliedFilters, column, filterValue)
            : [...appliedFilters, updated],
        );
      } else {
        setDrafts((prev) => ({ ...prev, [column.name]: updated }));
      }

      if (shouldClose) {
        setOpenFilterName(null);
      }
    },
    [appliedFilters, commitFilters, dropDraft, filters, relations],
  );

  const updateFilter = useCallback((filter: FilterItem) => {
    setDrafts((prev) => ({ ...prev, [filter.name]: filter }));
  }, []);

  const clearFilters = useCallback(() => {
    setDrafts({});
    setOpenFilterName(null);
    setState({ filters: {} });
  }, [setState]);

  const onOpenChange = useCallback(
    (filterName: string, isOpen: boolean) => {
      if (isOpen) {
        setOpenFilterName(filterName);
        return;
      }

      setOpenFilterName(null);

      // Al cerrar el desplegable se descarta el borrador sin valor: si la
      // columna ya tenía un filtro aplicado, vuelve a verse ese.
      const draft = drafts[filterName];

      if (draft && !hasValidValue(draft)) {
        dropDraft(filterName);
      }
    },
    [drafts, dropDraft],
  );

  const updateSort = useCallback(
    (column: string, direction: SortDirection) => {
      setState({ ...state, sortColumn: column, sortDirection: direction });
    },
    [setState, state],
  );

  const clearSort = useCallback(() => {
    setState({ ...state, sortColumn: undefined, sortDirection: undefined });
  }, [setState, state]);

  const updateSearch = useCallback(
    (search: string) => {
      setState({ ...state, search: search || undefined });
    },
    [setState, state],
  );

  const clearSearch = useCallback(() => {
    setState({ ...state, search: undefined });
  }, [setState, state]);

  return {
    filters,
    openFilterName,
    sortState,
    search: state.search ?? '',
    activeViewId: state.view ?? '',

    addFilter,
    removeFilter,
    updateFilterValue: handleUpdateFilterValue,
    updateFilter,
    clearFilters,

    setOpenFilterName,
    onOpenChange,

    updateSort,
    clearSort,

    updateSearch,
    clearSearch,
  };
}

export type UseFilterStateReturn = ReturnType<typeof useFilterState>;
