/**
 * Pantalla y error de la ficha de un registro del CMS, compartidos por sus
 * dos rutas (`.../record/$id` y `.../record?col=valor`).
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

import { RecordView } from '@pymekit/cms-data-explorer-ui/components';
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
        data={data}
        relatedPages={props.relatedPages}
        onRelatedPageChange={props.onRelatedPageChange}
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
