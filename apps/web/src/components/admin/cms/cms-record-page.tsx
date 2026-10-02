/**
 * Pantallas del registro del CMS (ficha, edición y creación) y su error,
 * compartidos por las rutas de clave simple (`.../record/$id`) y compuesta
 * (`.../record?col=valor`).
 *
 * `CmsRecordPage` lee de la caché la ficha que precargó el `loader`
 * (`useSuspenseQuery`) y monta `RecordView` de
 * `@pymekit/cms-data-explorer-ui`. La página de cada sección relacionada
 * vive en la URL (`relatedPages`); cambiarla es navegar sin volver a pedir
 * la ficha, porque no forma parte de las dependencias del `loader`.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';

import {
  RecordCreateView,
  RecordEditView,
  RecordView,
} from '@pymekit/cms-data-explorer-ui/components';
import {
  EmptyMedia,
  EmptyState,
  EmptyStateButton,
  EmptyStateHeading,
  EmptyStateText,
} from '@pymekit/ui/empty-state';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { cmsQueries } from '#/lib/cms/cms-queries.ts';

export function CmsRecordPage(props: {
  schema: string;
  table: string;
  keys: Record<string, string>;
  relatedPages: Record<string, number> | undefined;
  onRelatedPageChange: (relationKey: string, page: number) => void;
}) {
  const { schema, table, keys } = props;
  const { data } = useSuspenseQuery(cmsQueries.record({ schema, table, keys }));

  return (
    <PageBody className="py-2">
      <RecordView
        key={`${schema}.${table}:${JSON.stringify(keys)}`}
        schema={schema}
        table={table}
        keys={keys}
        data={data}
        relatedPages={props.relatedPages}
        onRelatedPageChange={props.onRelatedPageChange}
      />
    </PageBody>
  );
}

/**
 * Página de edición: lee de la caché la ficha que precargó el `loader`
 * (`loadCmsRecordForEdit`, que ya comprobó el permiso `update`).
 */
export function CmsRecordEditPage(props: {
  schema: string;
  table: string;
  keys: Record<string, string>;
  /** URL de la ficha, a la que se vuelve al guardar o cancelar. */
  recordHref: string;
}) {
  const { schema, table, keys } = props;
  const { data } = useSuspenseQuery(cmsQueries.record({ schema, table, keys }));

  return (
    <PageBody className="py-2">
      <RecordEditView
        key={`${schema}.${table}:${JSON.stringify(keys)}`}
        schema={schema}
        table={table}
        keys={keys}
        data={data}
        recordHref={props.recordHref}
      />
    </PageBody>
  );
}

/**
 * Página «Nuevo registro»: lee el metadato de la tabla que precargó el
 * `loader` (`loadCmsTableForCreate`, que ya comprobó el permiso `insert`).
 */
export function CmsRecordCreatePage(props: { schema: string; table: string }) {
  const { schema, table } = props;
  const { data } = useSuspenseQuery(cmsQueries.tableMetadata(schema, table));

  return (
    <PageBody className="py-2">
      <RecordCreateView
        key={`${schema}.${table}`}
        schema={schema}
        table={table}
        metadata={data}
      />
    </PageBody>
  );
}

export function CmsRecordError(props: { reset: () => void }) {
  const router = useRouter();

  return (
    <PageBody className="py-8">
      <EmptyState data-testid="record-load-error" className="min-h-64 p-6">
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>

        <EmptyStateHeading>
          <Trans i18nKey="cms.dataExplorer.record.loadErrorHeading" />
        </EmptyStateHeading>

        <EmptyStateText>
          <Trans i18nKey="cms.dataExplorer.record.loadErrorText" />
        </EmptyStateText>

        <EmptyStateButton
          onClick={() => {
            props.reset();
            void router.invalidate();
          }}
        >
          <Trans i18nKey="cms.dataExplorer.retry" />
        </EmptyStateButton>
      </EmptyState>
    </PageBody>
  );
}
