/**
 * Ficha de un registro por su clave (`.../record/$id`).
 *
 * Página provisional: el listado (F2.4a) ya enlaza aquí al pulsar una fila;
 * la ficha, la edición y el borrado llegan en F2.4b y F2.4c. Hereda la
 * guarda de acceso del *layout* `/admin/cms`.
 */
import { createFileRoute } from '@tanstack/react-router';

import { Trans } from '@pymekit/ui/trans';

import { CmsPlaceholderPage } from '#/components/admin/cms/cms-placeholder-page.tsx';

export const Route = createFileRoute(
  '/admin/cms/resources/$schema/$table/record/$id',
)({
  head: ({ params }) => ({
    meta: [{ title: `${params.schema}.${params.table} · ${params.id}` }],
  }),
  component: CmsRecordPage,
});

function CmsRecordPage() {
  const { schema, table, id } = Route.useParams();

  return (
    <div data-testid="cms-record-page" data-record-id={id}>
      <CmsPlaceholderPage
        title={
          <Trans
            i18nKey="cms.placeholder.resourceTitle"
            values={{ schema, table }}
          />
        }
        increment="F2.4b"
      />
    </div>
  );
}
