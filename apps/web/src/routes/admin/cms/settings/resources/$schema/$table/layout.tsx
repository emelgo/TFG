/**
 * Diseñador de la ficha de un registro
 * (`/admin/cms/settings/resources/$schema/$table/layout`, F2.7c).
 *
 * Carga el mismo metadato que la configuración de la tabla
 * (`loadResourceSettings`) y monta `RecordLayoutDesigner`, que guarda la
 * distribución en `ui_config.recordLayout`; la ficha del explorador (F2.4b)
 * la usa en cuanto se invalida su consulta.
 *
 * [TFG] RF-09 · ADR-011 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { RecordLayoutDesigner } from '@pymekit/cms-settings-ui/components';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { loadResourceSettings } from '#/lib/cms/cms-resource-settings.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute(
  '/admin/cms/settings/resources/$schema/$table/layout',
)({
  beforeLoad: ({ context }) =>
    requireCmsSettingsTab(context.cmsAccess, 'resources'),
  loader: ({ context, params }) => loadResourceSettings(context, params),
  head: () => ({
    meta: [{ title: getTranslator()('cms.settings.resources.layout.title') }],
  }),
  component: RecordLayoutPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="record-layout-load-error" />
  ),
});

function RecordLayoutPage() {
  const { schema, table } = Route.useParams();
  const { data } = useSuspenseQuery(
    cmsQueries.resourceSettingsTable(schema, table),
  );

  return <RecordLayoutDesigner data={data} schema={schema} table={table} />;
}
