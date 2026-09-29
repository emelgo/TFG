/**
 * Ficha de un registro con clave compuesta (`.../record?col1=a&col2=b`).
 *
 * Página provisional hasta F2.4b: el listado enlaza aquí cuando la tabla
 * identifica sus filas con varias columnas. Hereda la guarda de acceso del
 * *layout* `/admin/cms`.
 */
import { createFileRoute } from '@tanstack/react-router';

import { Trans } from '@pymekit/ui/trans';

import { CmsPlaceholderPage } from '#/components/admin/cms/cms-placeholder-page.tsx';

export const Route = createFileRoute(
  '/admin/cms/resources/$schema/$table/record/',
)({
  component: CmsRecordByKeysPage,
});

function CmsRecordByKeysPage() {
  const { schema, table } = Route.useParams();

  return (
    <div data-testid="cms-record-page">
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
