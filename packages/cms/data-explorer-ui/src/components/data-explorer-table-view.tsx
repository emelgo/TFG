/**
 * Pantalla del listado de una tabla en el explorador de datos del CMS.
 *
 * Reúne las piezas del explorador: pestañas, cabecera con el nombre de la
 * tabla y el total de registros, barra de filtros (búsqueda, filtros, vistas
 * guardadas, orden y columnas) y la tabla paginada.
 *
 * No carga datos ni conoce la ruta: la ruta de la web
 * (`/admin/cms/resources/$schema/$table/`) le pasa la página ya cargada por
 * su `loader`, la URL validada (`search`) y la función para cambiarla
 * (`onSearchChange`). Así el componente se puede reutilizar y la lógica de
 * datos queda en un único sitio.
 *
 * Las acciones de escritura dependen de los permisos del usuario sobre la
 * tabla (`queries.tablePermissions`, que la ruta precarga): «Nuevo
 * registro» con `insert`, selección y borrado múltiple con `delete` y
 * edición en línea con `update`. Sin permiso no se muestran; con él, la API
 * vuelve a comprobarlo en cada escritura.
 *
 * [TFG] RF-09: explorador de datos del CMS (listado).
 */
import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Grid2X2, PlusCircleIcon, SearchX, XIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'use-intl';

import { getLookupRelations } from '@pymekit/cms-data-explorer-core/utils';
import type { RelationData } from '@pymekit/cms-table/components';
import type { ColumnMetadata } from '@pymekit/cms-types';
import type { CmsTableData } from '@pymekit/cms-ui-core/api';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { Button } from '@pymekit/ui/button';
import { cn } from '@pymekit/ui/utils';

import { useColumnPreferences } from '../hooks/use-column-preferences';
import { useTableTabManagement } from '../hooks/use-data-explorer-tabs';
import { saveFilterContext } from '../utils/filter-context';
import { DATA_EXPLORER_BASE_PATH } from '../utils/paths';
import { toTableKeysConfig } from '../utils/record-keys';
import {
  type RecordSelection,
  getPageSelectionState,
  getRecordKeyConditions,
  isRecordSelected,
  setPageSelection,
  toggleRecordSelection,
} from '../utils/record-selection';
import type { DataExplorerSearch } from '../utils/search-schema';
import { BatchDeleteDialog } from './batch-delete-dialog';
import { DataExplorerTable } from './data-explorer-table';
import { DataExplorerTabs } from './data-explorer-tabs';
import { FiltersContainer } from './filters/filters-container';

export function DataExplorerTableView(props: {
  schema: string;
  table: string;
  data: CmsTableData;
  search: DataExplorerSearch;
  onSearchChange: (search: DataExplorerSearch) => void;
  /** `true` mientras se carga otra página o se aplican filtros. */
  isLoading?: boolean;
}) {
  const t = useTranslations('cms.dataExplorer');
  const format = useFormatter();
  const { queries } = useCmsApi();
  const { schema, table, data, search } = props;

  const columns = data.columns as ColumnMetadata[];
  const displayName = data.table.displayName || data.table.tableName;

  const savedViews = useQuery(queries.savedViews(schema, table));
  const permissions = useQuery(queries.tablePermissions(schema, table));

  const canInsert = permissions.data?.canInsert === true;
  const canUpdate = permissions.data?.canUpdate === true;
  const canDelete = permissions.data?.canDelete === true;

  // Filas seleccionadas para borrar (de cualquier página). El componente se
  // monta de nuevo al cambiar de tabla (`key`), así que no se mezclan.
  const [selection, setSelection] = useState<RecordSelection>(() => new Map());

  const keysConfig = useMemo(
    () => toTableKeysConfig(data.table.uiConfig),
    [data.table.uiConfig],
  );

  const rowSelection = useMemo(() => {
    if (!canDelete) {
      return undefined;
    }

    const records = data.data;

    return {
      canSelect: (record: Record<string, unknown>) =>
        getRecordKeyConditions(record, keysConfig) !== null,
      isSelected: (record: Record<string, unknown>) =>
        isRecordSelected(selection, record, keysConfig),
      toggle: (record: Record<string, unknown>) =>
        setSelection((current) =>
          toggleRecordSelection(current, record, keysConfig),
        ),
      pageState: getPageSelectionState(selection, records, keysConfig),
      togglePage: (selected: boolean) =>
        setSelection((current) =>
          setPageSelection(current, records, keysConfig, selected),
        ),
    };
  }, [canDelete, data.data, keysConfig, selection]);

  const relationsConfig = useMemo(
    () => getLookupRelations(data.table.relationsConfig),
    [data.table.relationsConfig],
  );

  const columnManagement = useColumnPreferences({ schema, table, columns });

  useTableTabManagement(displayName);

  // Memoriza los filtros de la tabla para restaurarlos al volver a ella
  // (ver `utils/filter-context.ts`). El efecto está justificado: escribe en
  // `sessionStorage`, un sistema externo, cuando cambia la URL.
  useEffect(() => {
    saveFilterContext(schema, table, search);
  }, [schema, table, search]);

  const createHref = `${DATA_EXPLORER_BASE_PATH}/${encodeURIComponent(
    schema,
  )}/${encodeURIComponent(table)}/new`;

  const hasCriteria = Boolean(
    search.search || Object.keys(search.filters ?? {}).length > 0,
  );

  return (
    <div
      className="flex flex-1 flex-col gap-2"
      data-testid="data-explorer"
      data-schema={schema}
      data-table={table}
    >
      <DataExplorerTabs />

      <div className="flex h-10 items-center justify-between">
        <span className="text-secondary-foreground flex items-center gap-x-1.5 text-sm">
          <Grid2X2 className="text-muted-foreground h-3.5 w-3.5" />

          <h1 data-testid="table-title" className="text-sm font-medium">
            {displayName}
          </h1>

          <span
            className="text-muted-foreground text-xs"
            data-testid="table-total-count"
            data-count={data.totalCount}
          >
            {t('table.count', {
              count: data.totalCount,
              formatted: format.number(data.totalCount),
            })}
          </span>
        </span>

        <div className="flex items-center gap-2">
          {canDelete && selection.size > 0 ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                data-testid="clear-selection-button"
                onClick={() => setSelection(new Map())}
              >
                <XIcon className="h-3.5 w-3.5" />
                {t('table.clearSelection')}
              </Button>

              <BatchDeleteDialog
                schema={schema}
                table={table}
                selection={selection}
                displayFormat={data.table.displayFormat}
                onDeleted={() => setSelection(new Map())}
              />
            </>
          ) : null}

          {canInsert ? (
            <Button
              nativeButton={false}
              size="sm"
              data-testid="create-record-link"
              render={<Link to={createHref} />}
            >
              <PlusCircleIcon className="h-3.5 w-3.5" />
              {t('table.createRecord')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="bg-background relative mb-2 flex flex-1 flex-col overflow-hidden rounded-lg border">
        <FiltersContainer
          schema={schema}
          table={table}
          columns={columns}
          relations={relationsConfig}
          relatedData={data.relations as RelationData[]}
          views={savedViews.data}
          search={search}
          onSearchChange={props.onSearchChange}
          columnManagement={columnManagement}
        />

        <DataExplorerTable
          className={cn('transition-opacity', {
            'opacity-50': props.isLoading,
          })}
          schema={schema}
          table={table}
          columns={columns}
          data={data.data}
          uiConfig={data.table.uiConfig}
          relationsConfig={relationsConfig}
          relations={data.relations as RelationData[]}
          pagination={data.pagination}
          search={search}
          onSearchChange={props.onSearchChange}
          columnManagement={columnManagement}
          selection={rowSelection}
          canUpdate={canUpdate}
          noResultsMessage={
            <span
              className="flex flex-col items-center gap-2"
              data-testid="data-explorer-empty"
            >
              <SearchX className="text-muted-foreground h-6 w-6" />
              {hasCriteria ? t('table.noMatches') : t('table.noRecords')}
            </span>
          }
        />
      </div>
    </div>
  );
}
