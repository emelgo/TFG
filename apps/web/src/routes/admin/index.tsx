import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { AdminDashboard } from '@pymekit/admin/components/admin-dashboard';
import { PageBody, PageHeader } from '@pymekit/ui/page';

import { requirePlatformAdmin } from '#/lib/admin/admin-guards.ts';
import { fetchAdminDashboard } from '#/lib/server/admin.functions.ts';

export const Route = createFileRoute('/admin/')({
  // Panel de la plataforma: solo super-admin. El personal del CMS va al CMS
  // (ADR-014); `fetchAdminDashboard` lo vuelve a exigir en el servidor.
  beforeLoad: ({ context }) => requirePlatformAdmin(context.user),
  loader: () => fetchAdminDashboard(),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const t = useTranslations('common');
  const data = Route.useLoaderData();

  return (
    <PageBody>
      <PageHeader description={t('superAdmin')} />

      <AdminDashboard data={data} />
    </PageBody>
  );
}
