/**
 * Ajustes > Permisos (`/admin/cms/settings/permissions`, F2.7b): roles,
 * grupos de permisos y permisos del RBAC del CMS.
 *
 * Solo con `role:select` o `permission:select` (`requireCmsSettingsTab`;
 * sin ellos, «no encontrado», y la API responde 403 con
 * `PERMISSION_ACCESS_DENIED`). La pestaña y el filtro viven en la URL
 * (`RbacSearchSchema`); el `loader` precarga el resumen con
 * `ensureQueryData` y el componente lo lee con `useSuspenseQuery`.
 *
 * [TFG] RF-09 · ADR-013 · ADR-014.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { PermissionsSettingsView } from '@pymekit/cms-settings-ui/components';
import {
  type RbacSearch,
  RbacSearchSchema,
} from '@pymekit/cms-settings-ui/utils';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/settings/permissions/')({
  validateSearch: RbacSearchSchema,
  beforeLoad: ({ context }) =>
    requireCmsSettingsTab(context.cmsAccess, 'permissions'),
  loader: async ({ context }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    try {
      await context.queryClient.ensureQueryData(cmsQueries.rbacOverview());
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: () => ({
    meta: [{ title: getTranslator()('cms.settings.permissions.title') }],
  }),
  component: PermissionsPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="rbac-load-error" />
  ),
});

function PermissionsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(cmsQueries.rbacOverview());

  return (
    <PermissionsSettingsView
      data={data}
      search={search}
      onSearchChange={(next: RbacSearch) =>
        void navigate({ search: next, resetScroll: false })
      }
    />
  );
}
