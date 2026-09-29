import { If } from '@pymekit/ui/if';
import { getContextAwareNavigation } from '@pymekit/ui/navigation-utils';
import { Sidebar, SidebarContent, SidebarHeader } from '@pymekit/ui/sidebar';
import { SidebarNavigation } from '@pymekit/ui/sidebar-navigation';

import { UserNotifications } from '#/components/home/user-notifications.tsx';
import { WorkspaceDropdown } from '#/components/home/workspace-dropdown.tsx';
import { useWorkspace } from '#/components/workspace-context.tsx';
import { accountModeConfig } from '#/config/account-mode.config.ts';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import { workspaceNavigationConfig } from '#/config/navigation.config.tsx';

/**
 * Main sidebar for the dashboard shell: the workspace switcher plus the app
 * navigation. Serves both personal and team accounts via the active account.
 */
export function AppSidebar() {
  const workspace = useWorkspace();
  const { user } = workspace;

  // Filter navigation by the active account context (personal vs team) and the
  // configured account mode. Routes tagged with a `context` only appear on the
  // matching surface; untagged routes are always shown.
  const navigationConfig = getContextAwareNavigation(
    workspaceNavigationConfig.routes,
    {
      isOrganization: !workspace.account.is_personal_account,
      mode: accountModeConfig.mode,
    },
  );

  return (
    <Sidebar
      variant="floating"
      collapsible={workspaceNavigationConfig.sidebarCollapsedStyle}
    >
      <SidebarHeader className={'h-16 justify-center'}>
        <div className={'flex items-center justify-between gap-x-1'}>
          <WorkspaceDropdown workspace={workspace} />

          <If condition={featureFlagsConfig.enableNotifications}>
            <div className={'group-data-[collapsible=icon]:hidden'}>
              <UserNotifications userId={user.id} />
            </div>
          </If>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNavigation config={navigationConfig} />
      </SidebarContent>
    </Sidebar>
  );
}
