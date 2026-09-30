/**
 * Explorador de usuarios del CMS: ficha de un usuario
 * (`/admin/cms/users/$id`).
 *
 * Exige el permiso de la sección (`requireCmsSection`) y precarga la ficha
 * (`GET /v1/users/:id`), que trae además las acciones que el usuario actual
 * puede hacer con él. Un id que no es un UUID, un usuario inexistente o un
 * 403 se muestran como «no encontrado».
 *
 * [TFG] RF-09 · ADR-011 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { UserDetailsView } from '@pymekit/cms-users-explorer-ui/components';
import { PageBody } from '@pymekit/ui/page';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSection } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute('/admin/cms/users/$id')({
  beforeLoad: ({ context }) => requireCmsSection(context.cmsAccess, 'users'),
  loader: async ({ context, params }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    // La API lo validaría con 400; se corta antes para no pedir nada.
    if (!UUID_PATTERN.test(params.id)) {
      throw notFound();
    }

    try {
      await context.queryClient.ensureQueryData(cmsQueries.user(params.id));
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: () => ({ meta: [{ title: getTranslator()('cms.sidebar.users') }] }),
  component: UserPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="user-load-error" />
  ),
});

function UserPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(cmsQueries.user(id));

  return (
    <PageBody className="py-2">
      <UserDetailsView data={data.data} />
    </PageBody>
  );
}
