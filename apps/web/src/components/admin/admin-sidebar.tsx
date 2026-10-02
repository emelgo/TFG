/**
 * Barra lateral de la consola de administración.
 *
 * Una sola consola organizada por áreas de negocio, sin separar
 * «plataforma» y «CMS» (ver `admin-navigation.ts`):
 *
 *  1. «Inicio», solo para el super-admin;
 *  2. una entrada plegable por área con sus tablas
 *     (`admin-sidebar-resources.tsx`); en el área de cuentas, el
 *     super-admin tiene además «Gestión de cuentas»;
 *  3. tras un separador, las herramientas del CMS que la API permite al
 *     usuario y el enlace discreto «Todas las tablas».
 *
 * En la cabecera, para quien tiene acceso al CMS, la búsqueda global.
 */
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import type { JWTUserData } from '@pymekit/supabase/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@pymekit/ui/sidebar';
import { Trans } from '@pymekit/ui/trans';

import { AppLogo } from '#/components/app-logo.tsx';
import { PersonalAccountDropdownContainer } from '#/components/home/personal-account-dropdown-container.tsx';

import {
  ACCOUNTS_AREA_NAME,
  HOME_ENTRY,
  type NavigationEntry,
  isEntryActive,
  useAdminNavigation,
} from './admin-navigation.ts';
import { AdminSidebarArea, getAreaKey } from './admin-sidebar-resources.tsx';
import { CmsGlobalSearch } from './cms/cms-global-search.tsx';

export function AdminSidebar(props: { user: JWTUserData | null }) {
  const t = useTranslations('cms.sidebar');
  const navigation = useAdminNavigation(props.user);

  const topEntries = [
    navigation.showHome ? HOME_ENTRY : null,
    navigation.accountsManagement && !navigation.accountsManagement.inArea
      ? navigation.accountsManagement.entry
      : null,
  ].filter((entry) => entry !== null);

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader className={'m-2'}>
        <AppLogo className="max-w-full" />

        {/* Búsqueda global del CMS (Cmd/Ctrl+K), solo con acceso al CMS. */}
        {props.user?.has_cms_access ? <CmsGlobalSearch /> : null}
      </SidebarHeader>

      <SidebarContent>
        {topEntries.length > 0 ? (
          <SidebarGroup data-testid="admin-sidebar-home-group">
            <SidebarGroupContent>
              <AdminSidebarMenu entries={topEntries} />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {navigation.areas.length > 0 ? (
          <SidebarGroup
            data-testid="admin-sidebar-areas"
            aria-label={t('areasLabel')}
            // Con la barra plegada a iconos, una lista de tablas sin texto no
            // sirve: se oculta y queda «Todas las tablas».
            className="group-data-[collapsible=icon]:hidden"
          >
            <SidebarGroupContent>
              <SidebarMenu>
                {navigation.areas.map((area) => (
                  <AdminSidebarArea
                    key={getAreaKey(area.name)}
                    area={area}
                    defaultOpen={navigation.areas.length === 1}
                    leadingEntry={
                      area.name === ACCOUNTS_AREA_NAME &&
                      navigation.accountsManagement?.inArea
                        ? navigation.accountsManagement.entry
                        : null
                    }
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {navigation.tools.length > 0 || navigation.allTables ? (
          <>
            <SidebarSeparator />

            <SidebarGroup
              data-testid="admin-sidebar-tools"
              aria-label={t('toolsLabel')}
            >
              <SidebarGroupContent>
                <AdminSidebarMenu entries={navigation.tools} />

                {navigation.allTables ? (
                  <AdminSidebarMenu
                    entries={[navigation.allTables]}
                    className="text-muted-foreground mt-2"
                    size="sm"
                  />
                ) : null}
              </SidebarGroupContent>
            </SidebarGroup>
          </>
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
  className?: string;
  size?: 'sm' | 'default';
}) {
  const { pathname } = useLocation();

  return (
    <SidebarMenu className={props.className}>
      {props.entries.map((entry) => (
        <SidebarMenuItem key={entry.id}>
          <SidebarMenuButton
            size={props.size}
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
