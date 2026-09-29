/**
 * Tabla del listado de una tabla de la base de datos.
 *
 * Adapta la tabla genérica del CMS (`AdvancedDataTable`) al explorador:
 * la ordenación y la paginación se traducen a cambios de la URL (el `loader`
 * de la ruta vuelve a pedir la página al servidor), cada celda se pinta según
 * el metadato de su columna y un clic en una fila abre la ficha del registro.
 */
import { useCallback, useMemo } from 'react';

import { useNavigate } from '@tanstack/react-router';
import type { Row } from '@tanstack/react-table';

import {
  AdvancedDataTable,
  type ColumnManagementState,
  DataExplorerCellRenderer,
  type RelationData,
} from '@pymekit/cms-table/components';
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

import { buildResourceUrl } from '../utils/build-resource-url';
import { toResourceHref } from '../utils/paths';
import { type DataExplorerSearch, getNextSort } from '../utils/search-schema';

type RecordData = Record<string, unknown>;

type TableUiConfig = {
  primary_keys: Array<{ column_name: string }>;
  unique_constraints: Array<{ constraint_name: string; columns?: string[] }>;
};

export function DataExplorerTable(props: {
  schema: string;
  table: string;
  columns: ColumnMetadata[];
  data: RecordData[];
  uiConfig: unknown;
  relationsConfig: RelationConfig[];
  relations: RelationData[];
  pagination: { pageIndex: number; pageSize: number; pageCount: number };
  search: DataExplorerSearch;
  onSearchChange: (search: DataExplorerSearch) => void;
  columnManagement: ColumnManagementState;
  noResultsMessage?: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const { search, onSearchChange, schema, table, relations } = props;

  const uiConfig = useMemo<TableUiConfig>(() => {
    const config = (props.uiConfig ?? {}) as Partial<TableUiConfig>;

    return {
      primary_keys: config.primary_keys ?? [],
      unique_constraints: config.unique_constraints ?? [],
    };
  }, [props.uiConfig]);

  const onSortChange = useCallback(
    (column: string) =>
      onSearchChange({ ...search, ...getNextSort(search, column), page: 1 }),
    [search, onSearchChange],
  );

  const onPaginationChange = useCallback(
    ({ pageIndex }: { pageIndex: number }) =>
      onSearchChange({ ...search, page: pageIndex + 1 }),
    [search, onSearchChange],
  );

  // Enlace de la API (`/schema/tabla/record/<id>`) convertido en ruta de la
  // web, para que la celda de una clave foránea lleve a la fila relacionada.
  const buildRelationLink = useCallback(
    (record: RecordData, column: string) => {
      const relation = relations.find(
        (item) => item.column === column && item.original === record[column],
      );

      return relation
        ? {
            ...relation,
            link: relation.link ? toResourceHref(relation.link) : relation.link,
          }
        : undefined;
    },
    [relations],
  );

  const onRowClick = useCallback(
    (row: Row<RecordData>) => {
      const href = buildResourceUrl({
        schema,
        table,
        record: row.original,
        tableMetadata: uiConfig,
      });

      // Sin clave primaria ni columnas únicas no hay ficha a la que ir.
      if (href) {
        void navigate({ href });
      }
    },
    [navigate, schema, table, uiConfig],
  );

  return (
    <AdvancedDataTable<RecordData>
      sticky
      className={props.className}
      columns={props.columns}
      data={props.data}
      pagination={props.pagination}
      onPaginationChange={onPaginationChange}
      columnManagement={props.columnManagement}
      sortColumn={search.sortColumn}
      sortDirection={search.sortDirection ?? 'asc'}
      onSortChange={onSortChange}
      buildRelationLink={buildRelationLink}
      CellRenderer={DataExplorerCellRenderer}
      relationsConfig={props.relationsConfig}
      onRowClick={onRowClick}
      noResultsMessage={props.noResultsMessage}
    />
  );
}
