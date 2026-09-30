/**
 * Entradas de navegación de la consola de administración.
 *
 * La barra lateral (escritorio) y el menú móvil muestran las mismas entradas,
 * así que se calculan aquí una sola vez:
 *
 *  - **Plataforma** (panel y cuentas): solo para el super-admin.
 *  - **CMS**: una entrada por sección que la API del CMS permite al usuario.
 *    La visibilidad se calcula con `getCmsSectionVisibility` a partir de
 *    `GET /v1/account` (permisos de sección) y `GET /v1/navigation` (tablas
 *    legibles). Ambas consultas las precarga el *loader* de `/admin`.
 *  - **Recursos**: las tablas legibles de `GET /v1/navigation` (ya filtradas
 *    por el RBAC del CMS), agrupadas por esquema y con un límite
 *    (`getSidebarResourceGroups`), como acceso directo a su listado.
 *
 * [TFG] RF-08 · RF-09 · ADR-014 · ADR-017.
 */
import { useQuery } from '@tanstack/react-query';
import type { LinkProps } from '@tanstack/react-router';
import {
  Database,
  FolderOpen,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  ScrollText,
  Settings,
  UserCog,
  Users,
} from 'lucide-react';

import {
  getSidebarResourceGroups,
  getVisibleResources,
} from '@pymekit/cms-ui-core/resources';
import {
  CMS_SECTIONS,
  CMS_SECTION_PATHS,
  type CmsSection,
  getCmsSectionVisibility,
} from '@pymekit/cms-ui-core/sections';
import type { JWTUserData } from '@pymekit/supabase/types';

import { cmsQueries } from '#/lib/cms/cms-queries.ts';

export type NavigationEntry = {
  id: string;
  path: NonNullable<LinkProps['to']>;
  labelKey: string;
  Icon: LucideIcon;
  /** Si se marca como activa también en subrutas (no solo en la exacta). */
  matchPrefix: boolean;
};

/** Páginas de la plataforma (solo super-admin). */
export const PLATFORM_ENTRIES: NavigationEntry[] = [
  {
    id: 'dashboard',
    path: '/admin',
    labelKey: 'cms.sidebar.platformDashboard',
    Icon: LayoutDashboard,
    matchPrefix: false,
  },
  {
    id: 'accounts',
    path: '/admin/accounts',
    labelKey: 'cms.sidebar.platformAccounts',
    Icon: Users,
    matchPrefix: true,
  },
];

const CMS_SECTION_ICONS: Record<CmsSection, LucideIcon> = {
  resources: Database,
  users: UserCog,
  storage: FolderOpen,
  auditLogs: ScrollText,
  dashboards: LayoutGrid,
  settings: Settings,
};

/**
 * Devuelve las entradas del grupo «CMS» que el usuario puede ver. Mientras
 * las consultas no han respondido (o si la API rechaza el acceso) la lista
 * está vacía: nunca se muestra una entrada que la API no haya confirmado.
 */
export function useCmsNavigationEntries(user: JWTUserData | null) {
  const enabled = Boolean(user?.has_cms_access);

  const account = useQuery({ ...cmsQueries.account(), enabled });
  const navigation = useQuery({ ...cmsQueries.navigation(), enabled });

  const visibility = getCmsSectionVisibility({
    access: account.data?.access,
    visibleResourcesCount: getVisibleResources(navigation.data ?? []).length,
  });

  return CMS_SECTIONS.filter((section) => visibility[section]).map(
    (section): NavigationEntry => ({
      id: section,
      path: CMS_SECTION_PATHS[section],
      labelKey: `cms.sidebar.${section}`,
      Icon: CMS_SECTION_ICONS[section],
      matchPrefix: true,
    }),
  );
}

/**
 * Indica si una entrada está activa para la ruta actual. La portada del CMS
 * (`/admin/cms`) cuenta como parte del explorador de datos, porque es donde
 * se listan las tablas.
 */
export function isEntryActive(entry: NavigationEntry, pathname: string) {
  if (
    entry.id === 'resources' &&
    pathname.replace(/\/$/, '') === '/admin/cms'
  ) {
    return true;
  }

  return entry.matchPrefix
    ? pathname === entry.path || pathname.startsWith(`${entry.path}/`)
    : pathname.replace(/\/$/, '') === entry.path;
}

/**
 * Devuelve las tablas del grupo «Recursos» (agrupadas por esquema y
 * limitadas). Comparte la consulta `GET /v1/navigation` con
 * `useCmsNavigationEntries` (TanStack Query la pide una sola vez). Mientras
 * no hay respuesta, o sin acceso al CMS, la lista está vacía.
 */
export function useCmsSidebarResources(user: JWTUserData | null) {
  const enabled = Boolean(user?.has_cms_access);
  const account = useQuery({ ...cmsQueries.account(), enabled });
  const navigation = useQuery({ ...cmsQueries.navigation(), enabled });

  // Si la API rechaza el acceso (MFA pendiente, cuenta inactiva) no hay
  // `access` y no se muestra ninguna tabla, igual que las secciones.
  return getSidebarResourceGroups(
    account.data?.access ? (navigation.data ?? []) : [],
  );
}
