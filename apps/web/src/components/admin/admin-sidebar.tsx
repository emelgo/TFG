import { Link, useLocation } from '@tanstack/react-router';
import { LayoutDashboard, Users } from 'lucide-react';

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
} from '@pymekit/ui/sidebar';

import { AppLogo } from '#/components/app-logo.tsx';
import { PersonalAccountDropdownContainer } from '#/components/home/personal-account-dropdown-container.tsx';

export function AdminSidebar() {
  const { pathname } = useLocation();

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader className={'m-2'}>
        <AppLogo className="max-w-full" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Super Admin</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuButton
                isActive={pathname === '/admin'}
                render={
                  <Link className={'flex gap-2.5'} to={'/admin'}>
                    <LayoutDashboard className={'h-4'} />
                    <span>Dashboard</span>
                  </Link>
                }
              />

              <SidebarMenuButton
                isActive={pathname.includes('/admin/accounts')}
                render={
                  <Link
                    className={'flex size-full gap-2.5'}
                    to={'/admin/accounts'}
                  >
                    <Users className={'h-4'} />
                    <span>Accounts</span>
                  </Link>
                }
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <PersonalAccountDropdownContainer />
      </SidebarFooter>
    </Sidebar>
  );
}
