/**
 * Explorador de usuarios del CMS: listado (`/admin/cms/users`).
 *
 * Cuelga del *layout* `/admin/cms`, que comprueba el acceso al CMS, y exige
 * además el permiso propio de la sección (`requireCmsSection`), así que
 * escribir la URL a mano sin permiso responde «no encontrado».
 *
 *  - **URL como estado:** página y búsqueda viven en los *search params*
 *    (`UsersSearchSchema`); cambiarlas es navegar.
 *  - **Datos:** el `loader` precarga la página con `ensureQueryData` y el
 *    componente la lee con `useSuspenseQuery` (misma entrada de caché).
 *  - **Acciones:** las muestra `UsersTableView` según los permisos que
 *    devuelve la API; la API vuelve a comprobarlas.
 *
 * [TFG] RF-09 · ADR-011 · ADR-013: explorador de usuarios como ruta de la web.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useRouterState } from '@tanstack/react-router';

import { UsersTableView } from '@pymekit/cms-users-explorer-ui/components';
import {
  type UsersSearch,
  UsersSearchSchema,
  toUsersListParams,
} from '@pymekit/cms-users-explorer-ui/utils';
import { PageBody } from '@pymekit/ui/page';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSection } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/users/')({
  validateSearch: UsersSearchSchema,
  loaderDeps: ({ search }) => search,
  beforeLoad: ({ context }) => requireCmsSection(context.cmsAccess, 'users'),
  loader: async ({ context, deps }) => {
    // Sin acceso válido (aviso de MFA) el *layout* no renderiza la página.
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    try {
      await context.queryClient.ensureQueryData(
        cmsQueries.usersList(toUsersListParams(deps)),
      );
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: () => ({ meta: [{ title: getTranslator()('cms.sidebar.users') }] }),
  component: UsersPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="users-load-error" />
  ),
});

function UsersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data } = useSuspenseQuery(
    cmsQueries.usersList(toUsersListParams(search)),
  );

  // Mientras el `loader` trae la nueva página se atenúa la actual.
  const isLoading = useRouterState({
    select: (state) => state.status === 'pending',
  });

  return (
    <PageBody className="py-2">
      <UsersTableView
        data={data}
        search={search}
        isLoading={isLoading}
        onSearchChange={(next: UsersSearch) =>
          void navigate({ search: next, resetScroll: false })
        }
      />
    </PageBody>
  );
}
