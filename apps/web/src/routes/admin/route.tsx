import {
  Outlet,
  createFileRoute,
  notFound,
  redirect,
} from '@tanstack/react-router';

import { Page, PageMobileNavigation, PageNavigation } from '@pymekit/ui/page';
import { SidebarProvider } from '@pymekit/ui/sidebar';

import { AdminMobileNavigation } from '#/components/admin/admin-mobile-navigation.tsx';
import { AdminSidebar } from '#/components/admin/admin-sidebar.tsx';
import { AppLogo } from '#/components/app-logo.tsx';
import pathsConfig from '#/config/paths.config.ts';

// Super-admin gate. The root `beforeLoad` already resolved `context.user` from
// the JWT (with `is_superadmin` derived from role + aal2). Anonymous visitors go
// to sign-in; authenticated non-admins get a 404 — this collapses the old
// `AdminGuard` server-component wrapper + admin proxy middleware into one guard.
export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        href: `${pathsConfig.auth.signIn}?next=${encodeURIComponent(location.href)}`,
      });
    }

    if (!context.user.is_superadmin) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Super Admin' }] }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <SidebarProvider>
      <Page style={'sidebar'}>
        <PageNavigation>
          <AdminSidebar />
        </PageNavigation>

        <PageMobileNavigation>
          <div>
            <AppLogo />
          </div>

          <AdminMobileNavigation />
        </PageMobileNavigation>

        <Outlet />
      </Page>
    </SidebarProvider>
  );
}
