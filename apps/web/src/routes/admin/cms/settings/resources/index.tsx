/**
 * Ajustes > Recursos (`/admin/cms/settings/resources`, F2.7c): tablas
 * gestionadas por el CMS, su visibilidad y orden, y la sincronización con el
 * catálogo de PostgreSQL.
 *
 * Solo con el permiso de sistema `table` (`requireCmsSettingsTab`; sin él,
 * «no encontrado»). El `loader` precarga el listado con `ensureQueryData` y
 * el componente lo lee con `useSuspenseQuery`; las mutaciones invalidan la
 * consulta (`useUpdateTablesMetadataMutation`).
 *
 * [TFG] RF-09 · ADR-011 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ResourcesSettingsView } from '@pymekit/cms-settings-ui/components';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/settings/resources/')({
  beforeLoad: ({ context }) =>
    requireCmsSettingsTab(context.cmsAccess, 'resources'),
  loader: async ({ context }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    try {
      await context.queryClient.ensureQueryData(
        cmsQueries.resourceSettingsList(),
      );
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: ({ match }) => ({
    meta: [
      {
        title: getTranslator(match.context.locale)(
          'cms.settings.resources.title',
        ),
      },
    ],
  }),
  component: ResourcesSettingsPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="resources-settings-load-error" />
  ),
});

function ResourcesSettingsPage() {
  const { data } = useSuspenseQuery(cmsQueries.resourceSettingsList());

  return <ResourcesSettingsView data={data} />;
}
