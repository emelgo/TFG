/**
 * Barra lateral de la consola de administración.
 *
 * Tiene dos grupos: «Plataforma», solo para el super-admin, y «CMS», para
 * cualquiera que haya entrado en la consola (super-admin o personal del CMS),
 * con las entradas que la API del CMS le permite (ver `admin-navigation.ts`).
 */
import { Link, useLocation } from '@tanstack/react-router';

import type { JWTUserData } from '@pymekit/supabase/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@pymekit/ui/sidebar';
import { Trans } from '@pymekit/ui/trans';

import { AppLogo } from '#/components/app-logo.tsx';
import { PersonalAccountDropdownContainer } from '#/components/home/personal-account-dropdown-container.tsx';

import {
  type NavigationEntry,
  PLATFORM_ENTRIES,
  isEntryActive,
  useCmsNavigationEntries,
} from './admin-navigation.ts';

export function AdminSidebar(props: { user: JWTUserData | null }) {
  const cmsEntries = useCmsNavigationEntries(props.user);

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader className={'m-2'}>
        <AppLogo className="max-w-full" />
      </SidebarHeader>

      <SidebarContent>
        {props.user?.is_superadmin ? (
          <SidebarGroup data-testid="admin-sidebar-platform-group">
            <SidebarGroupLabel>
              <Trans i18nKey="cms.sidebar.platformGroup" />
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <AdminSidebarMenu entries={PLATFORM_ENTRIES} prefix="platform" />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {props.user?.has_cms_access ? (
          <SidebarGroup data-testid="admin-sidebar-cms-group">
            <SidebarGroupLabel>
              <Trans i18nKey="cms.sidebar.cmsGroup" />
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <AdminSidebarMenu entries={cmsEntries} prefix="cms" />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <PersonalAccountDropdownContainer />
      </SidebarFooter>
    </Sidebar>
  );
}

function AdminSidebarMenu(props: {
  entries: NavigationEntry[];
  prefix: 'platform' | 'cms';
}) {
  const { pathname } = useLocation();

  return (
    <SidebarMenu>
      {props.entries.map((entry) => (
        <SidebarMenuItem key={entry.id}>
          <SidebarMenuButton
            isActive={isEntryActive(entry, pathname)}
            render={
              <Link
                className={'flex size-full gap-2.5'}
                to={entry.path}
                data-testid={`admin-sidebar-${props.prefix}-${entry.id}`}
              >
                <entry.Icon className={'h-4'} />

                <span>
                  <Trans i18nKey={entry.labelKey} />
                </span>
              </Link>
            }
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
