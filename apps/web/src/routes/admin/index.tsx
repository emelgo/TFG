import { isRedirect, createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { AdminDashboard } from '@pymekit/admin/components/admin-dashboard';
import { Alert, AlertDescription } from '@pymekit/ui/alert';
import { PageBody, PageHeader } from '@pymekit/ui/page';

import { requirePlatformAdmin } from '#/lib/admin/admin-guards.ts';
import { fetchAdminDashboard } from '#/lib/server/admin.functions.ts';

export const Route = createFileRoute('/admin/')({
  // Panel de la plataforma: solo super-admin. El personal del CMS va al CMS
  // (ADR-014); `fetchAdminDashboard` lo vuelve a exigir en el servidor.
  beforeLoad: ({ context }) => requirePlatformAdmin(context.user),
  // Si fallan las estadísticas (p. ej. una sesión que ya no existe en la BD)
  // la consola no se rompe entera: se muestra un aviso en su lugar (F3b). Las
  // redirecciones (sesión caducada → inicio de sesión) sí se propagan.
  loader: async () => {
    try {
      return { data: await fetchAdminDashboard() };
    } catch (error) {
      if (isRedirect(error)) throw error;

      return { data: null };
    }
  },
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const t = useTranslations('common');
  const tAdmin = useTranslations('admin');
  const { data } = Route.useLoaderData();

  return (
    <PageBody>
      <PageHeader
        description={t('superAdmin')}
        title={tAdmin('homeTitle')}
        summary={tAdmin('homeSummary')}
      />

      {data ? (
        <AdminDashboard data={data} />
      ) : (
        <Alert variant="destructive" data-testid="admin-dashboard-error">
          <AlertDescription>{tAdmin('dashboardLoadError')}</AlertDescription>
        </Alert>
      )}
    </PageBody>
  );
}
