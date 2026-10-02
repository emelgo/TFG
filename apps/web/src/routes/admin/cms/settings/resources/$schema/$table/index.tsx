/**
 * Configuración de una tabla en Ajustes > Recursos
 * (`/admin/cms/settings/resources/$schema/$table`, F2.7c): metadato de la
 * tabla, columnas y secciones de relaciones.
 *
 * Mismo control que el listado (permiso de sistema `table`). Un esquema o
 * tabla con un nombre no válido se corta aquí con «no encontrado»; la API
 * responde 403 a los esquemas protegidos y 404 a las tablas no
 * registradas, que `rethrowCmsSectionError` también convierte en «no
 * encontrado».
 *
 * [TFG] RF-09 · ADR-011 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ResourceSettingsView } from '@pymekit/cms-settings-ui/components';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { loadResourceSettings } from '#/lib/cms/cms-resource-settings.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute(
  '/admin/cms/settings/resources/$schema/$table/',
)({
  beforeLoad: ({ context }) =>
    requireCmsSettingsTab(context.cmsAccess, 'resources'),
  loader: ({ context, params }) => loadResourceSettings(context, params),
  head: () => ({
    meta: [{ title: getTranslator()('cms.settings.resources.table.title') }],
  }),
  component: ResourceSettingsPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="resource-settings-load-error" />
  ),
});

function ResourceSettingsPage() {
  const { schema, table } = Route.useParams();
  const { data } = useSuspenseQuery(
    cmsQueries.resourceSettingsTable(schema, table),
  );

  return <ResourceSettingsView data={data} schema={schema} table={table} />;
}
