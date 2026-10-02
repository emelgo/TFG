/**
 * Ficha de un panel del CMS (`/admin/cms/dashboards/$dashboardId`, F2.8):
 * rejilla de *widgets* con editor, duplicado, borrado y organización.
 *
 * El `loader` precarga el panel (`GET /v1/dashboards/:id`, que responde 404
 * si no existe o no se tiene acceso) y el componente lo lee con
 * `useSuspenseQuery`. Cada *widget* pide después sus propios datos, con el
 * permiso de lectura de la tabla comprobado para quien mira el panel.
 *
 * [TFG] RF-11 · ADR-011 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { DashboardView } from '@pymekit/cms-dashboards-ui/components';
import { PageBody } from '@pymekit/ui/page';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute('/admin/cms/dashboards/$dashboardId')({
  loader: async ({ context, params }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    // La API lo validaría con 400; se corta antes para no pedir nada.
    if (!UUID_PATTERN.test(params.dashboardId)) {
      throw notFound();
    }

    try {
      await context.queryClient.ensureQueryData(
        cmsQueries.dashboard(params.dashboardId),
      );
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: () => ({
    meta: [{ title: getTranslator()('cms.sidebar.dashboards') }],
  }),
  component: DashboardPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="dashboard-load-error" />
  ),
});

function DashboardPage() {
  const { dashboardId } = Route.useParams();
  const { data } = useSuspenseQuery(cmsQueries.dashboard(dashboardId));

  return (
    <PageBody className="py-2">
      <DashboardView data={data.data} />
    </PageBody>
  );
}
