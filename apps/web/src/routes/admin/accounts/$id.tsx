import { createFileRoute } from '@tanstack/react-router';

import { AdminAccountPage } from '@pymekit/admin/components/admin-account-page';

import { getTranslator } from '#/lib/i18n/translator.ts';
import { fetchAdminAccountPage } from '#/lib/server/admin.functions.ts';

export const Route = createFileRoute('/admin/accounts/$id')({
  loader: ({ params }) => fetchAdminAccountPage({ data: { id: params.id } }),
  head: ({ loaderData, match }) => {
    const t = getTranslator(match.context.locale);
    const name = loaderData?.account.name ?? t('admin.accountFallback');

    return { meta: [{ title: `${t('admin.pageTitlePrefix')} | ${name}` }] };
  },
  component: AdminAccountDetailPage,
});

function AdminAccountDetailPage() {
  const data = Route.useLoaderData();

  return <AdminAccountPage data={data} />;
}
