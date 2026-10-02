/**
 * Ficha de un registro en el explorador de datos del CMS (solo lectura).
 *
 * Reúne las piezas de la ficha: pestañas del explorador, migas de pan con
 * enlace de vuelta al listado de la tabla, los campos del registro (con la
 * distribución guardada de la tabla o la de por defecto) y las secciones de
 * registros relacionados.
 *
 * Como el listado, no carga datos ni conoce la ruta: la ruta de la web le
 * pasa la ficha ya cargada por su `loader` (`data`, de
 * `GET /v1/tables/:schema/:table/record`), la página de cada sección
 * relacionada (de la URL) y la función para cambiarla.
 *
 * Volver al listado no lleva parámetros: al entrar en la tabla, su `loader`
 * restaura los filtros con los que se dejó (`utils/filter-context.ts`), así
 * que se vuelve a la misma página y filtros desde cualquier ficha.
 *
 * Desde F2.4c la cabecera ofrece **Editar** y **Borrar** solo si los
 * permisos que devuelve la API con la ficha (`permissions.canUpdate` y
 * `canDelete`) lo permiten. Ocultarlos es comodidad, no seguridad: la API y
 * la función SQL vuelven a comprobar el permiso en cada escritura.
 *
 * [TFG] RF-09: explorador de datos del CMS (ficha de un registro).
 */
import { useMemo } from 'react';

import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, Grid2X2, SquarePenIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { getLookupRelations } from '@pymekit/cms-data-explorer-core/utils';
import type { ColumnMetadata } from '@pymekit/cms-types';
import type { CmsRecordData } from '@pymekit/cms-ui-core/api';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@pymekit/ui/breadcrumb';
import { Button } from '@pymekit/ui/button';

import { useTableTabManagement } from '../../hooks/use-data-explorer-tabs';
import {
  buildResourceUrl,
  toRecordEditHref,
} from '../../utils/build-resource-url';
import { DATA_EXPLORER_BASE_PATH } from '../../utils/paths';
import { toTableKeysConfig } from '../../utils/record-keys';
import { getCustomRecordLayout } from '../../utils/record-layout';
import {
  type ForeignKeyRecord,
  type JunctionMetadataMap,
  getRecordDisplayName,
} from '../../utils/record-relations';
import {
  getRecordKeyConditions,
  toRecordKeys,
} from '../../utils/record-selection';
import { DataExplorerTabs } from '../data-explorer-tabs';
import { RelatedRecordsSections } from '../related-records/related-records-sections';
import { CustomLayoutRenderer } from './custom-layout-renderer';
import { DefaultLayoutRenderer } from './default-layout-renderer';
import { DeleteRecordDialog } from './delete-record-dialog';

export function RecordView(props: {
  schema: string;
  table: string;
  /** Clave con la que se cargó la ficha (`{ columna: valor }`). */
  keys: Record<string, string>;
  data: CmsRecordData;
  relatedPages: Record<string, number> | undefined;
  onRelatedPageChange: (relationKey: string, page: number) => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { schema, table } = props;
  const { data: record, metadata, permissions } = props.data;

  const columns = metadata.columns as ColumnMetadata[];
  const foreignKeyRecords = props.data.foreignKeyRecords as ForeignKeyRecord[];

  const relationsConfig = useMemo(
    () => getLookupRelations(metadata.table.relationsConfig),
    [metadata.table.relationsConfig],
  );

  const customLayout = useMemo(
    () => getCustomRecordLayout(metadata.table.uiConfig, columns),
    [metadata.table.uiConfig, columns],
  );

  const tableName = metadata.table.displayName || metadata.table.tableName;
  // Sin formato ni columna de nombre, la ficha se nombra por su clave
  // primaria (en una clave compuesta, sus valores unidos).
  const recordName = useMemo(() => {
    const primaryKeys = new Set(
      toTableKeysConfig(metadata.table.uiConfig).primary_keys.map(
        (pk) => pk.column_name,
      ),
    );

    const keyValues = [...primaryKeys]
      .map((column) => record[column])
      .filter((value) => value !== null && value !== undefined)
      .map(String);

    return getRecordDisplayName(
      metadata.table.displayFormat,
      record,
      keyValues.length > 0 ? keyValues.join(' · ') : undefined,
    );
  }, [metadata.table.uiConfig, metadata.table.displayFormat, record]);

  useTableTabManagement(
    recordName ? `${tableName} · ${recordName}` : tableName,
  );

  const listHref = `${DATA_EXPLORER_BASE_PATH}/${encodeURIComponent(
    schema,
  )}/${encodeURIComponent(table)}`;

  // La edición se abre con la misma forma de URL que la ficha: `/edit` tras
  // el valor de la clave, o `record/edit?col=…` si la clave es compuesta.
  const recordHref = buildResourceUrl({
    schema,
    table,
    record,
    tableMetadata: toTableKeysConfig(metadata.table.uiConfig),
  });

  const editHref = recordHref ? toRecordEditHref(recordHref) : '';

  // El borrado localiza el registro por su clave primaria (o única), no por
  // las columnas de la URL, que podrían no identificarlo de forma única.
  const deleteKeys = useMemo(() => {
    const conditions = getRecordKeyConditions(
      record,
      toTableKeysConfig(metadata.table.uiConfig),
    );

    return conditions ? toRecordKeys(conditions) : null;
  }, [record, metadata.table.uiConfig]);

  return (
    <div
      className="flex flex-1 flex-col gap-2 pb-16"
      data-testid="cms-record-page"
      data-schema={schema}
      data-table={table}
    >
      <DataExplorerTabs />

      <div className="flex h-10 items-center justify-between gap-2">
        <Breadcrumb className="min-w-0">
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link
                to={listHref}
                data-testid="record-breadcrumb-table"
                className="hover:bg-muted/30 text-secondary-foreground flex items-center gap-x-1.5 rounded-md py-1 hover:underline"
              >
                <Grid2X2 className="text-muted-foreground h-3.5 w-3.5" />
                <span>{tableName}</span>
              </Link>
            </BreadcrumbItem>

            <BreadcrumbSeparator />

            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage
                className="max-w-64 truncate"
                data-testid="record-title"
              >
                {recordName || t('record.noName')}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-2">
          <Button
            nativeButton={false}
            variant="link"
            size="sm"
            data-testid="record-back-link"
            render={<Link to={listHref} />}
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            {t('record.backToList')}
          </Button>

          {permissions.canUpdate && editHref ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              data-testid="edit-record-button"
              render={<Link to={editHref} />}
            >
              <SquarePenIcon className="h-3.5 w-3.5" />
              {t('record.edit')}
            </Button>
          ) : null}

          {permissions.canDelete && deleteKeys ? (
            <DeleteRecordDialog
              schema={schema}
              table={table}
              keys={deleteKeys}
              cacheKeys={props.keys}
              recordName={recordName || t('record.noName')}
              listHref={listHref}
            />
          ) : null}
        </div>
      </div>

      {customLayout ? (
        <CustomLayoutRenderer
          layout={customLayout}
          columns={columns}
          data={record}
          foreignKeyRecords={foreignKeyRecords}
        />
      ) : (
        <DefaultLayoutRenderer
          columns={columns}
          relationsConfig={relationsConfig}
          data={record}
          foreignKeyRecords={foreignKeyRecords}
        />
      )}

      <div className="mt-4">
        <RelatedRecordsSections
          schema={schema}
          table={table}
          recordData={record}
          relationsConfig={metadata.table.relationsConfig}
          junctionMetadataMap={
            props.data.junctionMetadataMap as JunctionMetadataMap
          }
          relatedPages={props.relatedPages}
          onRelatedPageChange={props.onRelatedPageChange}
        />
      </div>
    </div>
  );
}
