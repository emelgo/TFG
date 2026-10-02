/**
 * Ajustes > Permisos > ficha de un permiso
 * (`/admin/cms/settings/permissions/$id`, F2.7b).
 *
 * Solo con la pestaña Permisos visible. Precarga la ficha
 * (`GET /v1/permissions/:id`: definición, roles y grupos que lo tienen y lo
 * que el usuario puede hacer). Las rutas `roles/$id` y `groups/$id` tienen
 * un segmento fijo y el *router* las prefiere a esta. Un id que no es un
 * UUID, un permiso inexistente o un 403 se muestran como «no encontrado».
 *
 * [TFG] RF-09 · ADR-014 · ADR-015.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { PermissionDetailsView } from '@pymekit/cms-settings-ui/components';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { UUID_PATTERN } from '#/lib/cms/uuid.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/settings/permissions/$id')({
  beforeLoad: ({ context }) =>
    requireCmsSettingsTab(context.cmsAccess, 'permissions'),
  loader: async ({ context, params }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    if (!UUID_PATTERN.test(params.id)) {
      throw notFound();
    }

    try {
      await context.queryClient.ensureQueryData(
        cmsQueries.rbacPermission(params.id),
      );
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: ({ match }) => ({
    meta: [
      {
        title: getTranslator(match.context.locale)(
          'cms.settings.permissions.title',
        ),
      },
    ],
  }),
  component: PermissionPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="rbac-permission-load-error" />
  ),
});

function PermissionPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(cmsQueries.rbacPermission(id));

  return <PermissionDetailsView data={data} />;
}
