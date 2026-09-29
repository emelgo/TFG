import { createFileRoute } from '@tanstack/react-router';

import { AdminDashboard } from '@pymekit/admin/components/admin-dashboard';
import { PageBody, PageHeader } from '@pymekit/ui/page';

import { fetchAdminDashboard } from '#/lib/server/admin.functions.ts';

export const Route = createFileRoute('/admin/')({
  loader: () => fetchAdminDashboard(),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const data = Route.useLoaderData();

  return (
    <PageBody>
      <PageHeader description={`Super Admin`} />

      <AdminDashboard data={data} />
    </PageBody>
  );
}
