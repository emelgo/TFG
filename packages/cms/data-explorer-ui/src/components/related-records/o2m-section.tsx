/**
 * Sección de registros relacionados uno a muchos.
 *
 * Muestra las filas de otra tabla que apuntan al registro (por ejemplo, los
 * miembros de una cuenta de equipo). No hay un *endpoint* propio: se pide
 * una página del listado de la tabla hija filtrada por la clave foránea
 * (`{"account_id.eq": "<id>"}`), con la misma consulta y caché que el
 * explorador, así que la API vuelve a comprobar el permiso `select`.
 *
 * La página visible vive en la URL de la ficha (`relatedPages`) y llega por
 * `page`; cambiarla es navegar. Si la API responde 403 (el permiso se ha
 * retirado después de cargar la ficha), la sección desaparece en lugar de
 * mostrar un error: el usuario no debe ver tablas que no puede leer.
 *
 * Desde F2.4c, «Añadir» crea un registro hijo ya enlazado con este si el
 * usuario puede insertar en la tabla hija (`create-related-record-dialog.tsx`).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertCircle, ArrowRight, Database } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { getLookupRelations } from '@pymekit/cms-data-explorer-core/utils';
import type { RelationData } from '@pymekit/cms-table/components';
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { getCmsAccessFailure } from '@pymekit/cms-ui-core/errors';
import { Alert, AlertTitle } from '@pymekit/ui/alert';
import { Button } from '@pymekit/ui/button';
import { Card, CardContent } from '@pymekit/ui/card';
import { Skeleton } from '@pymekit/ui/skeleton';
import { cn } from '@pymekit/ui/utils';

import { DATA_EXPLORER_BASE_PATH } from '../../utils/paths';
import {
  buildOneToManyFilters,
  normalizeRecordId,
} from '../../utils/record-relations';
import { CreateRelatedRecordButton } from './create-related-record-dialog';
import { RelatedRecordsSectionHeader } from './related-records-section-header';
import { RelatedRecordsTable } from './related-records-table';

const DEFAULT_PAGE_SIZE = 5;

export function O2MSection(props: {
  relation: RelationConfig;
  relationKey: string;
  recordData: Record<string, unknown>;
  label: string;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { queries } = useCmsApi();
  const { relation, page } = props;

  const filters = buildOneToManyFilters(relation, props.recordData);
  const parentValue = normalizeRecordId(
    props.recordData[relation.source_column],
  );
  const pageSize =
    relation.inline_config?.max_visible_rows || DEFAULT_PAGE_SIZE;

  const query = useQuery({
    ...queries.tableData({
      schema: relation.target_schema,
      table: relation.target_table,
      page,
      pageSize,
      filters: filters ?? undefined,
    }),
    // Sin valor en la columna origen no hay filas que buscar.
    enabled: filters !== null,
    // Al cambiar de página se mantiene la anterior hasta que llega la nueva.
    placeholderData: keepPreviousData,
  });

  if (filters === null) {
    return null;
  }

  if (getCmsAccessFailure(query.error) === 'forbidden') {
    return null;
  }

  const data = query.data;
  const count = data?.totalCount ?? 0;

  const tableHref = `${DATA_EXPLORER_BASE_PATH}/${encodeURIComponent(
    relation.target_schema,
  )}/${encodeURIComponent(relation.target_table)}?filters=${encodeURIComponent(
    JSON.stringify(filters),
  )}`;

  return (
    <Card
      className="bg-background border ring-0"
      data-testid="related-records-section"
      data-relation-type="one_to_many"
      data-relation-key={props.relationKey}
      data-table={`${relation.target_schema}.${relation.target_table}`}
      data-count={data ? count : undefined}
    >
      <RelatedRecordsSectionHeader
        label={props.label}
        count={count}
        isLoading={query.isPending}
        action={
          <div className="flex items-center gap-1">
            {count > 0 ? (
              <Button
                nativeButton={false}
                variant="ghost"
                size="sm"
                data-testid="related-records-open-table"
                render={<Link to={tableHref} />}
              >
                {t('record.related.openTable')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}

            {parentValue !== null ? (
              <CreateRelatedRecordButton
                relation={relation}
                parentValue={parentValue}
                label={props.label}
              />
            ) : null}
          </div>
        }
      />

      <CardContent>
        {query.isPending ? (
          <div className="flex flex-col gap-2 py-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-4/6" />
          </div>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertTitle>{t('record.related.loadError')}</AlertTitle>
          </Alert>
        ) : count === 0 || !data ? (
          <div
            className="flex flex-col items-center justify-center gap-2 py-6 text-center"
            data-testid="related-records-empty"
          >
            <Database className="text-muted-foreground h-6 w-6" />

            <p className="text-muted-foreground text-sm">
              {t('record.related.empty')}
            </p>
          </div>
        ) : (
          <div
            className={cn('transition-opacity', {
              'opacity-50': query.isPlaceholderData,
            })}
          >
            <RelatedRecordsTable
              schema={relation.target_schema}
              table={relation.target_table}
              records={data.data}
              columns={data.columns as ColumnMetadata[]}
              uiConfig={data.table.uiConfig}
              relations={data.relations as RelationData[]}
              relationsConfig={getLookupRelations(data.table.relationsConfig)}
              visibleColumns={relation.inline_config?.visible_columns}
              pagination={data.pagination}
              onPageChange={(pageIndex) => props.onPageChange(pageIndex + 1)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
