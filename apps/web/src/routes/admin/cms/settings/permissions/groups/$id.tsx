/**
 * Ajustes > Permisos > ficha de un grupo de permisos
 * (`/admin/cms/settings/permissions/groups/$id`, F2.7b).
 *
 * Solo con la pestaña Permisos visible. Precarga la ficha
 * (`GET /v1/permissions/groups/:id`: permisos del grupo, roles que lo usan
 * y lo que el usuario puede hacer). Un id que no es un UUID, un grupo
 * inexistente o no visible y un 403 se muestran como «no encontrado».
 *
 * [TFG] RF-09 · ADR-014 · ADR-015.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { GroupDetailsView } from '@pymekit/cms-settings-ui/components';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { UUID_PATTERN } from '#/lib/cms/uuid.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute(
  '/admin/cms/settings/permissions/groups/$id',
)({
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
        cmsQueries.rbacGroup(params.id),
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
  component: GroupPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="rbac-group-load-error" />
  ),
});

function GroupPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(cmsQueries.rbacGroup(id));

  return <GroupDetailsView data={data} />;
}
