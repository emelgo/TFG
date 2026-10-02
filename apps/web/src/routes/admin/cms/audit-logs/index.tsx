/**
 * Registro de auditoría del CMS: listado (`/admin/cms/audit-logs`).
 *
 * Cuelga del *layout* `/admin/cms`, que comprueba el acceso al CMS, y exige
 * además el permiso propio de la sección (`requireCmsSection`, que refleja
 * `log:select`), así que escribir la URL a mano sin permiso responde «no
 * encontrado».
 *
 *  - **URL como estado:** filtros (autor, operaciones, tabla, gravedad y
 *    días) y cursor de paginación viven en los *search params*
 *    (`AuditLogsSearchSchema`); cambiarlos es navegar.
 *  - **Datos:** el `loader` precarga la página con `ensureQueryData` y el
 *    componente la lee con `useSuspenseQuery` (misma entrada de caché).
 *  - **Autorización:** la API vuelve a exigir `log:select` y la base de
 *    datos filtra por rango (`cms.can_read_audit_log`) y redacta los datos de
 *    tablas que el lector no puede leer.
 *
 * [TFG] RF-10 · ADR-011 · ADR-013: registro de auditoría como ruta de la web.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useRouterState } from '@tanstack/react-router';

import { AuditLogsView } from '@pymekit/cms-audit-logs-ui/components';
import {
  type AuditLogsSearch,
  AuditLogsSearchSchema,
  toAuditLogsListParams,
} from '@pymekit/cms-audit-logs-ui/utils';
import { PageBody } from '@pymekit/ui/page';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSection } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/audit-logs/')({
  validateSearch: AuditLogsSearchSchema,
  loaderDeps: ({ search }) => search,
  // Sección con permiso propio: si la barra lateral la oculta, escribir la
  // URL a mano tampoco la muestra.
  beforeLoad: ({ context }) =>
    requireCmsSection(context.cmsAccess, 'auditLogs'),
  loader: async ({ context, deps }) => {
    // Sin acceso válido (aviso de MFA) el *layout* no renderiza la página.
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    try {
      await context.queryClient.ensureQueryData(
        cmsQueries.auditLogsList(toAuditLogsListParams(deps)),
      );
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: () => ({ meta: [{ title: getTranslator()('cms.sidebar.auditLogs') }] }),
  component: AuditLogsPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="audit-logs-load-error" />
  ),
});

function AuditLogsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data } = useSuspenseQuery(
    cmsQueries.auditLogsList(toAuditLogsListParams(search)),
  );

  // Mientras el `loader` trae la nueva página se atenúa la actual.
  const isLoading = useRouterState({
    select: (state) => state.status === 'pending',
  });

  return (
    <PageBody className="py-2">
      <AuditLogsView
        data={data}
        search={search}
        isLoading={isLoading}
        onSearchChange={(next: AuditLogsSearch) =>
          void navigate({ search: next, resetScroll: false })
        }
      />
    </PageBody>
  );
}
