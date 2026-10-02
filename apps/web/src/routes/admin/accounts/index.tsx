import { createFileRoute } from '@tanstack/react-router';

import { AdminAccountsTable } from '@pymekit/admin/components/admin-accounts-table';
import { AdminCreateUserDialog } from '@pymekit/admin/components/admin-create-user-dialog';
import { AppBreadcrumbs } from '@pymekit/ui/app-breadcrumbs';
import { Button } from '@pymekit/ui/button';
import { PageBody, PageHeader } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { readString } from '#/lib/auth/search-params.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';
import { fetchAdminAccounts } from '#/lib/server/admin.functions.ts';

// Search params are optional so links to `/admin/accounts` (sidebar, mobile
// nav) don't have to supply them; `fetchAdminAccounts` applies the defaults
// (page 1, all types, empty query) server-side.
interface AccountsSearch {
  page?: number;
  account_type?: 'all' | 'team' | 'personal';
  query?: string;
}

export const Route = createFileRoute('/admin/accounts/')({
  validateSearch: (search: Record<string, unknown>): AccountsSearch => ({
    page:
      typeof search.page === 'number' && search.page > 0
        ? search.page
        : undefined,
    account_type:
      search.account_type === 'team' || search.account_type === 'personal'
        ? search.account_type
        : undefined,
    query: readString(search.query),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchAdminAccounts({ data: deps }),
  head: ({ match }) => ({
    meta: [
      {
        title: getTranslator(match.context.locale)(
          'cms.sidebar.platformAccounts',
        ),
      },
    ],
  }),
  component: AdminAccountsPage,
});

function AdminAccountsPage() {
  const { data, page, pageSize, pageCount, filters } = Route.useLoaderData();

  return (
    <PageBody>
      <PageHeader description={<AppBreadcrumbs />}>
        <div className="flex justify-end">
          <AdminCreateUserDialog>
            <Button data-testid="admin-create-user-button">
              <Trans i18nKey={'admin.createUser'} />
            </Button>
          </AdminCreateUserDialog>
        </div>
      </PageHeader>

      <AdminAccountsTable
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        data={data}
        filters={filters}
      />
    </PageBody>
  );
}
