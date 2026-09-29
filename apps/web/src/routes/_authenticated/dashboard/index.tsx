import { createFileRoute } from '@tanstack/react-router';

import { AppBreadcrumbs } from '@pymekit/ui/app-breadcrumbs';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { HomePageHeader } from '#/components/home/home-page-header.tsx';
import { DashboardDemo } from '#/components/team/dashboard-demo.tsx';

export const Route = createFileRoute('/_authenticated/dashboard/')({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <PageBody>
      <HomePageHeader
        title={<Trans i18nKey={'common.routes.dashboard'} />}
        description={<AppBreadcrumbs />}
      />

      <DashboardDemo />
    </PageBody>
  );
}
