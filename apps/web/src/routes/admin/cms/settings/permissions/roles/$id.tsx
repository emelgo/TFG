/**
 * Ajustes > Permisos > ficha de un rol
 * (`/admin/cms/settings/permissions/roles/$id`, F2.7b).
 *
 * Solo con la pestaña Permisos visible (`requireCmsSettingsTab`). Precarga
 * la ficha (`GET /v1/permissions/roles/:id`: rango, grupos, permisos
 * directos, miembros y lo que el usuario puede hacer). Un id que no es un
 * UUID, un rol inexistente o un 403 se muestran como «no encontrado».
 *
 * [TFG] RF-09 · ADR-014 · ADR-015.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { RoleDetailsView } from '@pymekit/cms-settings-ui/components';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { UUID_PATTERN } from '#/lib/cms/uuid.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute(
  '/admin/cms/settings/permissions/roles/$id',
)({
  beforeLoad: ({ context }) =>
    requireCmsSettingsTab(context.cmsAccess, 'permissions'),
  loader: async ({ context, params }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    // La API lo validaría con 400; se corta antes para no pedir nada.
    if (!UUID_PATTERN.test(params.id)) {
      throw notFound();
    }

    try {
      await context.queryClient.ensureQueryData(cmsQueries.rbacRole(params.id));
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: () => ({
    meta: [{ title: getTranslator()('cms.settings.permissions.title') }],
  }),
  component: RolePage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="rbac-role-load-error" />
  ),
});

function RolePage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(cmsQueries.rbacRole(id));

  return <RoleDetailsView data={data} />;
}
