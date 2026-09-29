/**
 * Sección de registros relacionados muchos a muchos (solo lectura).
 *
 * Una relación M2M pasa por una tabla intermedia (por ejemplo,
 * `post_tags(post_id, tag_id)`). Se resuelve con dos peticiones al listado,
 * igual que el resto del explorador (la API comprueba el permiso en cada
 * una):
 *
 *  1. la tabla intermedia filtrada por este registro, que da el total y las
 *     claves del otro extremo (las primeras `INLINE_LIMIT`);
 *  2. la tabla destino filtrada por esas claves (`id.in`), para mostrar su
 *     etiqueta (`display_format`) y enlazar a su ficha.
 *
 * Si hay más filas de las que se muestran, «Ver todas» abre la tabla
 * intermedia ya filtrada. Vincular y desvincular llegan con la edición de
 * registros (F2.4c).
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertCircle, ArrowRight, ExternalLink, Link2 } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { M2MRelationConfig } from '@pymekit/cms-types';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { getCmsAccessFailure } from '@pymekit/cms-ui-core/errors';
import { Alert, AlertTitle } from '@pymekit/ui/alert';
import { Button } from '@pymekit/ui/button';
import { Card, CardContent } from '@pymekit/ui/card';
import { Skeleton } from '@pymekit/ui/skeleton';

import { buildResourceUrl } from '../../utils/build-resource-url';
import { DATA_EXPLORER_BASE_PATH } from '../../utils/paths';
import { toTableKeysConfig } from '../../utils/record-keys';
import {
  buildJunctionFilters,
  buildM2MTargetFilters,
  getRecordDisplayName,
  normalizeRecordId,
} from '../../utils/record-relations';
import { RelatedRecordsSectionHeader } from './related-records-section-header';

/** Registros vinculados que se muestran sin paginar. */
const INLINE_LIMIT = 5;

export function M2MSection(props: {
  relation: M2MRelationConfig;
  relationKey: string;
  recordData: Record<string, unknown>;
  label: string;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { queries } = useCmsApi();
  const { relation } = props;

  const junctionFilters = buildJunctionFilters(relation, props.recordData);

  const junction = useQuery({
    ...queries.tableData({
      schema: relation.junctionSchema,
      table: relation.junctionTable,
      page: 1,
      pageSize: INLINE_LIMIT,
      filters: junctionFilters ?? undefined,
    }),
    enabled: junctionFilters !== null,
  });

  const targetIds = (junction.data?.data ?? [])
    .map((row) => normalizeRecordId(row[relation.junctionTargetColumn]))
    .filter((id): id is string | number => id !== null);

  const targets = useQuery({
    ...queries.tableData({
      schema: relation.targetSchema,
      table: relation.targetTable,
      page: 1,
      pageSize: INLINE_LIMIT,
      filters: buildM2MTargetFilters(relation, targetIds),
    }),
    enabled: targetIds.length > 0,
  });

  if (junctionFilters === null) {
    return null;
  }

  if (
    getCmsAccessFailure(junction.error) === 'forbidden' ||
    getCmsAccessFailure(targets.error) === 'forbidden'
  ) {
    return null;
  }

  const count = junction.data?.totalCount ?? 0;
  const targetConfig = toTableKeysConfig(targets.data?.table.uiConfig);
  const displayFormat = targets.data?.table.displayFormat ?? null;

  // Cada clave de la intermedia se empareja con su fila destino (si llegó).
  const linkedRecords = targetIds.map((id) => {
    const record = targets.data?.data.find(
      (row) => String(row[relation.targetColumn]) === String(id),
    );

    return {
      id: String(id),
      label: record
        ? getRecordDisplayName(displayFormat, record, id)
        : String(id),
      href: record
        ? buildResourceUrl({
            schema: relation.targetSchema,
            table: relation.targetTable,
            record,
            tableMetadata: targetConfig,
          })
        : '',
    };
  });

  const viewAllHref = `${DATA_EXPLORER_BASE_PATH}/${encodeURIComponent(
    relation.junctionSchema,
  )}/${encodeURIComponent(relation.junctionTable)}?filters=${encodeURIComponent(
    JSON.stringify(junctionFilters),
  )}`;

  const isLoading =
    junction.isPending || (targetIds.length > 0 && targets.isPending);

  return (
    <Card
      className="bg-background border ring-0"
      data-testid="related-records-section"
      data-relation-type="many_to_many"
      data-relation-key={props.relationKey}
      data-table={`${relation.targetSchema}.${relation.targetTable}`}
      data-count={junction.data ? count : undefined}
    >
      <RelatedRecordsSectionHeader
        label={props.label}
        count={count}
        isLoading={junction.isPending}
        icon={<Link2 className="text-muted-foreground h-3.5 w-3.5" />}
      />

      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2 py-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/6" />
          </div>
        ) : junction.isError || targets.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertTitle>{t('record.related.loadError')}</AlertTitle>
          </Alert>
        ) : count === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 py-6 text-center"
            data-testid="related-records-empty"
          >
            <Link2 className="text-muted-foreground h-6 w-6" />

            <p className="text-muted-foreground text-sm">
              {t('record.related.noLinkedRecords')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <ul className="divide-border divide-y rounded-md border">
              {linkedRecords.map((record) => (
                <li
                  key={record.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                  data-testid="related-linked-record"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {record.label}
                    </span>

                    {record.label !== record.id ? (
                      <span className="text-muted-foreground truncate text-xs">
                        {record.id}
                      </span>
                    ) : null}
                  </div>

                  {record.href ? (
                    <Button
                      nativeButton={false}
                      variant="ghost"
                      size="sm"
                      data-testid="related-linked-record-link"
                      render={<Link to={record.href} />}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('record.related.open')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>

            {count > INLINE_LIMIT ? (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                className="self-start"
                render={<Link to={viewAllHref} />}
              >
                {t('record.related.viewAll', { count })}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
