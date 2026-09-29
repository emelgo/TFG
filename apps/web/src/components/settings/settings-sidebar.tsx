import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@pymekit/ui/button';
import { Sidebar, SidebarContent, SidebarHeader } from '@pymekit/ui/sidebar';
import { SidebarNavigation } from '@pymekit/ui/sidebar-navigation';
import { Trans } from '@pymekit/ui/trans';

import { getSettingsNavigationConfig } from '#/components/settings/settings-navigation.tsx';
import { useWorkspace } from '#/components/workspace-context.tsx';
import pathsConfig from '#/config/paths.config.ts';

/**
 * Sidebar for the settings section: a "back to dashboard" link plus a settings
 * menu built from the active account (personal vs team).
 */
export function SettingsSidebar() {
  const { account } = useWorkspace();
  const config = getSettingsNavigationConfig(account);

  return (
    <Sidebar variant="floating" collapsible={config.sidebarCollapsedStyle}>
      <SidebarHeader className={'h-16 justify-center'}>
        <Button
          nativeButton={false}
          size={'sm'}
          variant={'ghost'}
          className={'w-full justify-start'}
          render={
            <Link to={pathsConfig.app.home}>
              <ArrowLeft className={'mr-1 size-4'} />

              <span className={'group-data-[collapsible=icon]:hidden'}>
                <Trans i18nKey={'common.routes.backToDashboard'} />
              </span>
            </Link>
          }
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarNavigation config={config} />
      </SidebarContent>
    </Sidebar>
  );
}
