/**
 * Registro de auditoría del CMS: ficha de una entrada
 * (`/admin/cms/audit-logs/$id`).
 *
 * Exige el permiso de la sección (`requireCmsSection`) y precarga la entrada
 * (`GET /v1/audit-logs/:id`). Un id que no es un UUID, una entrada que no
 * existe o una que el usuario no puede leer (de una cuenta de rango superior)
 * se muestran igual, como «no encontrado»: la API responde 404 en ambos casos
 * para no confirmar que existe.
 *
 * [TFG] RF-10 · ADR-011 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { AuditLogDetailsView } from '@pymekit/cms-audit-logs-ui/components';
import { PageBody } from '@pymekit/ui/page';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSection } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute('/admin/cms/audit-logs/$id')({
  beforeLoad: ({ context }) =>
    requireCmsSection(context.cmsAccess, 'auditLogs'),
  loader: async ({ context, params }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    // La API lo validaría con 400; se corta antes para no pedir nada.
    if (!UUID_PATTERN.test(params.id)) {
      throw notFound();
    }

    try {
      await context.queryClient.ensureQueryData(cmsQueries.auditLog(params.id));
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: () => ({ meta: [{ title: getTranslator()('cms.sidebar.auditLogs') }] }),
  component: AuditLogPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="audit-log-load-error" />
  ),
});

function AuditLogPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(cmsQueries.auditLog(id));

  return (
    <PageBody className="py-2">
      <AuditLogDetailsView data={data} />
    </PageBody>
  );
}
