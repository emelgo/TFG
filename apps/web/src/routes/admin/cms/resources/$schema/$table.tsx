/**
 * Explorador de datos de una tabla (`/admin/cms/resources/$schema/$table`).
 *
 * Página provisional: el listado, los filtros y el CRUD de la tabla llegan en
 * F2.4. Ya cuelga del *layout* `/admin/cms`, así que hereda su guarda de
 * acceso; la API volverá a comprobar el permiso sobre la tabla concreta.
 */
import { createFileRoute } from '@tanstack/react-router';

import { Trans } from '@pymekit/ui/trans';

import { CmsPlaceholderPage } from '#/components/admin/cms/cms-placeholder-page.tsx';

export const Route = createFileRoute('/admin/cms/resources/$schema/$table')({
  head: ({ params }) => ({
    meta: [{ title: `${params.schema}.${params.table}` }],
  }),
  component: CmsResourcePage,
});

function CmsResourcePage() {
  const { schema, table } = Route.useParams();

  return (
    <CmsPlaceholderPage
      title={
        <Trans
          i18nKey="cms.placeholder.resourceTitle"
          values={{ schema, table }}
        />
      }
      increment="F2.4"
    />
  );
}
