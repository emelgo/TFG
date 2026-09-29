/**
 * Barra de herramientas del listado: búsqueda global, «Añadir filtro», los
 * filtros aplicados, las vistas guardadas, el menú de ordenación y la gestión
 * de columnas.
 *
 * Conecta los componentes genéricos de `@pymekit/cms-filters` con la URL del
 * explorador: el adaptador de estado lee de `search` y escribe con
 * `onSearchChange`, que en la ruta es un `navigate({ search })` de TanStack
 * Router. Las acciones por lotes sobre las filas seleccionadas (borrar) no se
 * ofrecen todavía: llegan con la edición de registros.
 */
import { useMemo, useState } from 'react';

import {
  AddFilterDropdown,
  FiltersList,
  SearchInput,
  SortMenu,
} from '@pymekit/cms-filters/components';
import { useFilterState } from '@pymekit/cms-filters/hooks';
import type {
  FilterStateAdapter,
  RelatedDataItem,
} from '@pymekit/cms-filters/types';
import { getSortableColumns } from '@pymekit/cms-filters/utils';
import type { ColumnManagementState } from '@pymekit/cms-table/components';
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';
import type { CmsSavedViews } from '@pymekit/cms-ui-core/api';

import {
  type DataExplorerSearch,
  filterStateToSearch,
  searchToFilterState,
} from '../../utils/search-schema';
import { ColumnManagementPopover } from '../column-management-popover';
import { SavedViewsDropdown } from './views-container';

export interface FiltersContainerProps {
  schema: string;
  table: string;
  columns: ColumnMetadata[];
  relations: RelationConfig[];
  relatedData: RelatedDataItem[];
  views: CmsSavedViews | undefined;
  search: DataExplorerSearch;
  onSearchChange: (search: DataExplorerSearch) => void;
  columnManagement: ColumnManagementState;
}

export function FiltersContainer(props: FiltersContainerProps) {
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const { search, onSearchChange } = props;

  const stateAdapter = useMemo<FilterStateAdapter>(
    () => ({
      state: searchToFilterState(search),
      setState: (next) => onSearchChange(filterStateToSearch(next, search)),
    }),
    [search, onSearchChange],
  );

  const filterableColumns = useMemo(
    () => props.columns.filter((column) => column.is_filterable),
    [props.columns],
  );

  const {
    filters,
    openFilterName,
    sortState,
    addFilter,
    removeFilter,
    updateFilterValue,
    clearFilters,
    onOpenChange,
    updateSort,
    clearSort,
    updateSearch,
    clearSearch,
  } = useFilterState({
    columns: filterableColumns,
    relations: props.relations,
    relatedData: props.relatedData,
    stateAdapter,
  });

  const sortableColumns = getSortableColumns(props.columns);

  return (
    <div
      className="flex flex-col gap-1.5 rounded p-2"
      data-testid="filters-bar"
    >
      <SearchInput
        search={search.search ?? ''}
        onSearchChange={updateSearch}
        onClear={clearSearch}
      />

      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AddFilterDropdown
            columns={filterableColumns}
            onSelect={(column) => {
              addFilter(column);
              setAddFilterOpen(false);
            }}
            open={addFilterOpen}
            onOpenChange={setAddFilterOpen}
          />

          <FiltersList
            filters={filters}
            hasSearch={Boolean(search.search)}
            onRemove={(column) => removeFilter(column.name)}
            onValueChange={updateFilterValue}
            onOpenChange={onOpenChange}
            onClearFilters={clearFilters}
            openFilterName={openFilterName}
          />
        </div>

        <div className="flex items-center gap-2">
          <SavedViewsDropdown
            schema={props.schema}
            table={props.table}
            views={props.views}
            search={search}
            onSearchChange={onSearchChange}
          />

          <SortMenu
            columns={sortableColumns}
            currentSort={{
              ...sortState,
              columnName:
                sortableColumns.find((col) => col.name === sortState.column)
                  ?.display_name ?? sortState.column,
            }}
            onSortChange={updateSort}
            onClearSort={clearSort}
          />

          <ColumnManagementPopover
            columns={props.columns}
            columnManagement={props.columnManagement}
          />
        </div>
      </div>
    </div>
  );
}
