/**
 * Registros relacionados de la ficha: una sección por cada relación que
 * apunta al registro (uno a muchos y muchos a muchos).
 *
 * Qué relaciones se muestran lo decide `getVisibleRelatedRelations` (ver
 * `utils/record-relations.ts`): solo las de tablas que el usuario puede leer
 * según `GET /v1/navigation`, que el `loader` de la ruta ya dejó en caché.
 * Cada sección pide sus filas por separado y un fallo en una no rompe la
 * ficha: queda contenido por un *error boundary* propio.
 *
 * Diferencia con la versión de partida: allí las secciones se hidrataban de
 * forma diferida (al entrar en pantalla, de dos en dos). Aquí cada sección
 * pide directamente su primera página, que ya trae el total: las tablas de
 * una pyme tienen pocas relaciones y así el comportamiento es predecible.
 *
 * [TFG] RF-09: navegación entre registros relacionados con permisos del RBAC.
 */
import { useMemo } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { formatTableName } from '@pymekit/cms-data-explorer-core/utils';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { Alert, AlertTitle } from '@pymekit/ui/alert';
import { ErrorBoundary } from '@pymekit/ui/error-boundary';

import {
  type JunctionMetadataMap,
  getReadableTableKeys,
  getRelationKey,
  getVisibleRelatedRelations,
  toTableKey,
} from '../../utils/record-relations';
import { M2MSection } from './m2m-section';
import { O2MSection } from './o2m-section';

export function RelatedRecordsSections(props: {
  schema: string;
  table: string;
  recordData: Record<string, unknown>;
  relationsConfig: unknown;
  junctionMetadataMap: JunctionMetadataMap | undefined;
  /** Página visible de cada sección uno a muchos (de la URL). */
  relatedPages: Record<string, number> | undefined;
  onRelatedPageChange: (relationKey: string, page: number) => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { queries } = useCmsApi();
  const { data: resources } = useSuspenseQuery(queries.navigation());

  const { schema, table, relationsConfig, junctionMetadataMap } = props;

  const displayNames = useMemo(
    () =>
      new Map(
        resources.map((resource) => [
          toTableKey(resource.schemaName, resource.tableName),
          resource.displayName,
        ]),
      ),
    [resources],
  );

  const relations = useMemo(
    () =>
      getVisibleRelatedRelations({
        schema,
        table,
        relationsConfig,
        junctionMetadataMap,
        readableTables: getReadableTableKeys(resources),
      }),
    [schema, table, relationsConfig, junctionMetadataMap, resources],
  );

  if (relations.oneToMany.length === 0 && relations.manyToMany.length === 0) {
    return null;
  }

  // Nombre de la sección: el configurado en la relación, el nombre visible
  // de la tabla o, en su defecto, el nombre de la tabla legible.
  const labelFor = (schemaName: string, tableName: string, custom?: string) =>
    custom ||
    displayNames.get(toTableKey(schemaName, tableName)) ||
    formatTableName(tableName);

  const sectionError = (
    <Alert variant="destructive">
      <AlertCircle className="h-3.5 w-3.5" />
      <AlertTitle>{t('record.related.sectionError')}</AlertTitle>
    </Alert>
  );

  return (
    <section
      className="flex flex-col gap-y-3"
      data-testid="related-records-sections"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">
          {t('record.related.title')}
        </h2>

        <div className="bg-border h-px flex-1" />
      </div>

      <div className="flex flex-col gap-y-2">
        {relations.oneToMany.map((relation) => {
          const key = getRelationKey(relation);

          return (
            <ErrorBoundary key={key} fallback={sectionError}>
              <O2MSection
                relation={relation}
                relationKey={key}
                recordData={props.recordData}
                label={labelFor(
                  relation.target_schema,
                  relation.target_table,
                  relation.inline_config?.section_label,
                )}
                page={props.relatedPages?.[key] ?? 1}
                onPageChange={(page) => props.onRelatedPageChange(key, page)}
              />
            </ErrorBoundary>
          );
        })}

        {relations.manyToMany.map((relation) => {
          const key = getRelationKey(relation);

          return (
            <ErrorBoundary key={key} fallback={sectionError}>
              <M2MSection
                relation={relation}
                relationKey={key}
                recordData={props.recordData}
                label={labelFor(relation.targetSchema, relation.targetTable)}
              />
            </ErrorBoundary>
          );
        })}
      </div>
    </section>
  );
}
