import { Outlet, createFileRoute } from '@tanstack/react-router';

import { getContextAwareNavigation } from '@pymekit/ui/navigation-utils';
import { Page, PageMobileNavigation, PageNavigation } from '@pymekit/ui/page';
import { SidebarProvider } from '@pymekit/ui/sidebar';

import { AppLogo } from '#/components/app-logo.tsx';
import { AppMobileNavigation } from '#/components/app-mobile-navigation.tsx';
import { AppSidebar } from '#/components/app-sidebar.tsx';
import { useWorkspace } from '#/components/workspace-context.tsx';
import { accountModeConfig } from '#/config/account-mode.config.ts';
import { workspaceNavigationConfig } from '#/config/navigation.config.tsx';

// Main app shell (mounts the unified workspace sidebar). Sibling to the
// `settings` section, which mounts its own sidebar. The workspace context is
// provided by the parent `_authenticated` layout.
export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { account } = useWorkspace();

  const navigationConfig = getContextAwareNavigation(
    workspaceNavigationConfig.routes,
    {
      isOrganization: !account.is_personal_account,
      mode: accountModeConfig.mode,
    },
  );

  return (
    <SidebarProvider>
      <Page style={'sidebar'}>
        <PageNavigation>
          <AppSidebar />
        </PageNavigation>

        <PageMobileNavigation>
          <div>
            <AppLogo />
          </div>

          <AppMobileNavigation routes={navigationConfig.routes} />
        </PageMobileNavigation>

        <Outlet />
      </Page>
    </SidebarProvider>
  );
}
