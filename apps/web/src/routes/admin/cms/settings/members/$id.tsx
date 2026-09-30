/**
 * Ajustes > Miembros > ficha (`/admin/cms/settings/members/$id`, F2.7a).
 *
 * Solo con `account:select` (`requireCmsSettingsTab`). Precarga la ficha
 * (`GET /v1/members/:id`), que trae además lo que el usuario puede hacer con
 * el miembro y los roles que podría asignarle. Un id que no es un UUID, un
 * miembro inexistente o un 403 se muestran como «no encontrado».
 *
 * [TFG] RF-09 · RF-10 · ADR-014.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { MemberDetailsView } from '@pymekit/cms-settings-ui/components';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute('/admin/cms/settings/members/$id')({
  beforeLoad: ({ context }) =>
    requireCmsSettingsTab(context.cmsAccess, 'members'),
  loader: async ({ context, params }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    // La API lo validaría con 400; se corta antes para no pedir nada.
    if (!UUID_PATTERN.test(params.id)) {
      throw notFound();
    }

    try {
      await context.queryClient.ensureQueryData(cmsQueries.member(params.id));
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: () => ({
    meta: [{ title: getTranslator()('cms.settings.members.title') }],
  }),
  component: MemberPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="member-load-error" />
  ),
});

function MemberPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(cmsQueries.member(id));

  return <MemberDetailsView data={data} />;
}
