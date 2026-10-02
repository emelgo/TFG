/**
 * Ajustes > Miembros (`/admin/cms/settings/members`, F2.7a): listado de las
 * cuentas del personal del CMS.
 *
 * Solo con `account:select` (`requireCmsSettingsTab`; sin él, «no
 * encontrado»). Página y búsqueda viven en la URL
 * (`MembersSearchSchema`); el `loader` precarga la página con
 * `ensureQueryData` y el componente la lee con `useSuspenseQuery`.
 *
 * [TFG] RF-09 · ADR-011 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useRouterState } from '@tanstack/react-router';

import { MembersTableView } from '@pymekit/cms-settings-ui/components';
import {
  type MembersSearch,
  MembersSearchSchema,
  toMembersListParams,
} from '@pymekit/cms-settings-ui/utils';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/settings/members/')({
  validateSearch: MembersSearchSchema,
  loaderDeps: ({ search }) => search,
  beforeLoad: ({ context }) =>
    requireCmsSettingsTab(context.cmsAccess, 'members'),
  loader: async ({ context, deps }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    try {
      await context.queryClient.ensureQueryData(
        cmsQueries.membersList(toMembersListParams(deps)),
      );
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: ({ match }) => ({
    meta: [
      {
        title: getTranslator(match.context.locale)(
          'cms.settings.members.title',
        ),
      },
    ],
  }),
  component: MembersPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="members-load-error" />
  ),
});

function MembersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data } = useSuspenseQuery(
    cmsQueries.membersList(toMembersListParams(search)),
  );

  // Mientras el `loader` trae la nueva página se atenúa la actual.
  const isLoading = useRouterState({
    select: (state) => state.status === 'pending',
  });

  return (
    <MembersTableView
      data={data}
      search={search}
      isLoading={isLoading}
      onSearchChange={(next: MembersSearch) =>
        void navigate({ search: next, resetScroll: false })
      }
    />
  );
}
