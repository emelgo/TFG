import { createFileRoute } from '@tanstack/react-router';

import { AdminAccountPage } from '@pymekit/admin/components/admin-account-page';

import { fetchAdminAccountPage } from '#/lib/server/admin.functions.ts';

export const Route = createFileRoute('/admin/accounts/$id')({
  loader: ({ params }) => fetchAdminAccountPage({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `Admin | ${loaderData?.account.name ?? 'Account'}` }],
  }),
  component: AdminAccountDetailPage,
});

function AdminAccountDetailPage() {
  const data = Route.useLoaderData();

  return <AdminAccountPage data={data} />;
}
