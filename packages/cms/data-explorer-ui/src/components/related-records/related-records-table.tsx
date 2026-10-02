/**
 * Tabla compacta de registros relacionados.
 *
 * Reutiliza la tabla del listado (`AdvancedDataTable` con
 * `DataExplorerCellRenderer`) para que las celdas se vean igual que en el
 * explorador, pero sin ordenar ni gestionar columnas: muestra las columnas
 * configuradas para la sección (`inline_config.visible_columns`) o, por
 * defecto, las cinco primeras visibles que no son clave primaria. Al pulsar
 * una fila se abre su ficha; la paginación la gestiona quien la usa (la
 * página vive en la URL de la ficha).
 */
import { useCallback, useMemo } from 'react';

import { useNavigate } from '@tanstack/react-router';
import type { Row } from '@tanstack/react-table';

import {
  AdvancedDataTable,
  DataExplorerCellRenderer,
  type RelationData,
} from '@pymekit/cms-table/components';
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

import { buildResourceUrl } from '../../utils/build-resource-url';
import { toResourceHref } from '../../utils/paths';
import { toTableKeysConfig } from '../../utils/record-keys';

type RecordData = Record<string, unknown>;

const DEFAULT_MAX_COLUMNS = 5;

export function RelatedRecordsTable(props: {
  schema: string;
  table: string;
  records: RecordData[];
  columns: ColumnMetadata[];
  uiConfig: unknown;
  relations: RelationData[];
  relationsConfig: RelationConfig[];
  visibleColumns?: string[];
  pagination: { pageIndex: number; pageSize: number; pageCount: number };
  onPageChange: (pageIndex: number) => void;
}) {
  const navigate = useNavigate();
  const { schema, table, columns, visibleColumns, relations } = props;

  const displayColumns = useMemo(() => {
    // Columnas configuradas explícitamente: todas, en su orden.
    if (visibleColumns && visibleColumns.length > 0) {
      return visibleColumns
        .map((name) => columns.find((column) => column.name === name))
        .filter((column): column is ColumnMetadata => column !== undefined)
        .map((column) => ({ ...column, is_visible_in_table: true }));
    }

    return columns
      .filter((column) => column.is_visible_in_table && !column.is_primary_key)
      .slice(0, DEFAULT_MAX_COLUMNS);
  }, [columns, visibleColumns]);

  const keysConfig = useMemo(
    () => toTableKeysConfig(props.uiConfig),
    [props.uiConfig],
  );

  // Etiqueta y enlace de las claves foráneas de cada fila (la API solo los
  // incluye para las tablas destino que el usuario puede leer).
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
        tableMetadata: keysConfig,
      });

      if (href) {
        void navigate({ href });
      }
    },
    [navigate, schema, table, keysConfig],
  );

  const { onPageChange } = props;

  const onPaginationChange = useCallback(
    ({ pageIndex }: { pageIndex: number }) => onPageChange(pageIndex),
    [onPageChange],
  );

  return (
    <div className="overflow-x-auto">
      <AdvancedDataTable<RecordData>
        columns={displayColumns}
        data={props.records}
        pagination={props.pagination}
        onPaginationChange={onPaginationChange}
        buildRelationLink={buildRelationLink}
        CellRenderer={DataExplorerCellRenderer}
        relationsConfig={props.relationsConfig}
        onRowClick={onRowClick}
        tableProps={{ 'data-related-table': `${schema}.${table}` }}
      />
    </div>
  );
}
