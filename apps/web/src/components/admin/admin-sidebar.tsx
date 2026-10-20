/**
 * Barra lateral de la consola de administración.
 *
 * Una sola consola, sin separar «plataforma» y «CMS», con dos bloques
 * titulados (ver `admin-navigation.ts`):
 *
 *  1. **Gestión**: «Inicio» y «Gestión de cuentas» (solo super-admin) y las
 *     herramientas del CMS que la API permite al usuario.
 *  2. **Datos**: una carpeta por área con sus tablas
 *     (`admin-sidebar-resources.tsx`) y, al final, «Todas las tablas».
 *
 * Criterio visual: solo llevan icono las entradas de primer nivel (las de
 * Gestión, las carpetas y «Todas las tablas»); las tablas de dentro de una
 * carpeta van sin icono, así el nivel se distingue de un vistazo.
 *
 * En la cabecera, para quien tiene acceso al CMS, la búsqueda global.
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
  isEntryActive,
  useAdminNavigation,
} from './admin-navigation.ts';
import { AdminSidebarArea, getAreaKey } from './admin-sidebar-resources.tsx';
import { CmsGlobalSearch } from './cms/cms-global-search.tsx';

export function AdminSidebar(props: { user: JWTUserData | null }) {
  const navigation = useAdminNavigation(props.user);

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader className={'m-2'}>
        <AppLogo className="max-w-full" />

        {/* Búsqueda global del CMS (Cmd/Ctrl+K), solo con acceso al CMS. */}
        {props.user?.has_cms_access ? <CmsGlobalSearch /> : null}
      </SidebarHeader>

      <SidebarContent>
        {navigation.management.length > 0 ? (
          <SidebarGroup data-testid="admin-sidebar-management">
            <SidebarGroupLabel data-testid="admin-sidebar-management-label">
              <Trans i18nKey="cms.sidebar.managementGroup" />
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <AdminSidebarMenu entries={navigation.management} />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {navigation.areas.length > 0 || navigation.allTables ? (
          <SidebarGroup data-testid="admin-sidebar-data">
            <SidebarGroupLabel data-testid="admin-sidebar-data-label">
              <Trans i18nKey="cms.sidebar.dataGroup" />
            </SidebarGroupLabel>

            <SidebarGroupContent>
              {navigation.areas.length > 0 ? (
                <SidebarMenu
                  data-testid="admin-sidebar-areas"
                  // Con la barra plegada a iconos, una lista de carpetas sin
                  // texto no sirve: se oculta y queda «Todas las tablas».
                  className="group-data-[collapsible=icon]:hidden"
                >
                  {navigation.areas.map((area) => (
                    <AdminSidebarArea
                      key={getAreaKey(area.name)}
                      area={area}
                      defaultOpen={navigation.areas.length === 1}
                    />
                  ))}
                </SidebarMenu>
              ) : null}

              {navigation.allTables ? (
                <AdminSidebarMenu entries={[navigation.allTables]} />
              ) : null}
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

/** Lista de entradas de primer nivel (con icono). */
function AdminSidebarMenu(props: { entries: NavigationEntry[] }) {
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
                data-testid={getEntryTestId(entry)}
              />
            }
          >
            <entry.Icon className={'h-4'} />

            <span>
              <Trans i18nKey={entry.labelKey} />
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

/**
 * `data-testid` de cada entrada. Se conservan los de antes de unificar la
 * consola (`admin-sidebar-cms-<sección>`) para no romper las pruebas E2E.
 */
export function getEntryTestId(entry: NavigationEntry) {
  if (entry.id === 'home') return 'admin-sidebar-home';
  if (entry.id === 'accounts') return 'admin-sidebar-platform-accounts';

  return `admin-sidebar-cms-${entry.id}`;
}
