import { Outlet, createFileRoute } from '@tanstack/react-router';

import { Page, PageMobileNavigation, PageNavigation } from '@pymekit/ui/page';
import { SidebarProvider } from '@pymekit/ui/sidebar';

import { AppLogo } from '#/components/app-logo.tsx';
import { AppMobileNavigation } from '#/components/app-mobile-navigation.tsx';
import { getSettingsNavigationConfig } from '#/components/settings/settings-navigation.tsx';
import { SettingsSidebar } from '#/components/settings/settings-sidebar.tsx';
import { useWorkspace } from '#/components/workspace-context.tsx';

// Dedicated settings section: swaps the main workspace sidebar for a
// settings-only sidebar (with a "back to dashboard" link). Sibling to
// `dashboard`; the workspace context comes from `_authenticated`.
export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { account } = useWorkspace();
  const config = getSettingsNavigationConfig(account);

  return (
    <SidebarProvider>
      <Page style={'sidebar'}>
        <PageNavigation>
          <SettingsSidebar />
        </PageNavigation>

        <PageMobileNavigation>
          <div>
            <AppLogo />
          </div>

          <AppMobileNavigation routes={config.routes} />
        </PageMobileNavigation>

        <Outlet />
      </Page>
    </SidebarProvider>
  );
}
