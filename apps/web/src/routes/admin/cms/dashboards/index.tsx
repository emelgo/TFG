/**
 * Paneles del CMS: listado (`/admin/cms/dashboards`, F2.8).
 *
 * Cuelga del *layout* `/admin/cms`, que comprueba el acceso al CMS. La
 * sección está disponible para todo el personal con acceso válido: cada
 * miembro tiene sus propios paneles y ve los compartidos con sus roles.
 *
 *  - **URL como estado:** página, búsqueda y filtro (todos, míos,
 *    compartidos) viven en los *search params* (`DashboardsSearchSchema`).
 *  - **Datos:** el `loader` precarga la página con `ensureQueryData` y el
 *    componente la lee con `useSuspenseQuery` (misma entrada de caché).
 *  - **Autorización:** las acciones de propietario (compartir, borrar) solo
 *    se muestran en los paneles propios; la API y RLS lo vuelven a exigir.
 *
 * [TFG] RF-11 · ADR-011 · ADR-013: paneles como ruta de la web.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useRouterState } from '@tanstack/react-router';

import { DashboardsListView } from '@pymekit/cms-dashboards-ui/components';
import {
  type DashboardsSearch,
  DashboardsSearchSchema,
  toDashboardsListParams,
} from '@pymekit/cms-dashboards-ui/utils';
import { PageBody } from '@pymekit/ui/page';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/dashboards/')({
  validateSearch: DashboardsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    // Sin acceso válido (aviso de MFA) el *layout* no renderiza la página.
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    try {
      await context.queryClient.ensureQueryData(
        cmsQueries.dashboardsList(toDashboardsListParams(deps)),
      );
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: ({ match }) => ({
    meta: [
      { title: getTranslator(match.context.locale)('cms.sidebar.dashboards') },
    ],
  }),
  component: DashboardsPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="dashboards-load-error" />
  ),
});

function DashboardsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data } = useSuspenseQuery(
    cmsQueries.dashboardsList(toDashboardsListParams(search)),
  );

  // Mientras el `loader` trae la nueva página se atenúa la actual.
  const isLoading = useRouterState({
    select: (state) => state.status === 'pending',
  });

  return (
    <PageBody className="py-2">
      <DashboardsListView
        data={data.data}
        search={search}
        isLoading={isLoading}
        onSearchChange={(next: DashboardsSearch) =>
          void navigate({ search: next, resetScroll: false })
        }
      />
    </PageBody>
  );
}
