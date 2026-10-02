/**
 * Entradas de navegación de la consola de administración.
 *
 * La consola es UNA sola herramienta para quien administra la web de la
 * pyme, organizada por áreas de negocio y no por capas técnicas. La barra
 * lateral (escritorio) y el menú móvil muestran las mismas entradas, que se
 * calculan aquí una sola vez:
 *
 *  1. **Inicio** (`/admin`): solo el super-admin. El personal del CMS entra
 *     directamente en `/admin/cms`.
 *  2. **Áreas** («Blog», «Cuentas», «Facturación», «Sistema»…): las tablas
 *     legibles de `GET /v1/navigation` (ya filtradas por el RBAC del CMS)
 *     agrupadas con `groupResourcesByArea` según su
 *     `ui_config.navigation_group`. Las que no tienen área forman el grupo
 *     «Otros datos». En el área de cuentas, el super-admin tiene además
 *     «Gestión de cuentas» (`/admin/accounts`: bloquear, suplantar…).
 *  3. **Herramientas** (Usuarios, Archivos, Paneles, Auditoría, Ajustes):
 *     cada una con la visibilidad que da `getCmsSectionVisibility` a partir
 *     de `GET /v1/account`, y el enlace discreto «Todas las tablas».
 *
 * Ambas consultas las precarga el *loader* de `/admin`. Ocultar una entrada
 * es solo ayuda visual: la API y las políticas RLS vuelven a comprobarlo.
 *
 * [TFG] RF-08 · RF-09 · ADR-014 · ADR-017 · ADR-020.
 */
import { useQuery } from '@tanstack/react-query';
import type { LinkProps } from '@tanstack/react-router';
import {
  FolderOpen,
  House,
  LayoutGrid,
  type LucideIcon,
  ScrollText,
  Settings,
  TableProperties,
  UserCog,
  Users,
} from 'lucide-react';

import {
  getVisibleResources,
  groupResourcesByArea,
} from '@pymekit/cms-ui-core/resources';
import {
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

/** Portada de la consola (solo super-admin). */
export const HOME_ENTRY: NavigationEntry = {
  id: 'home',
  path: '/admin',
  labelKey: 'cms.sidebar.home',
  Icon: House,
  matchPrefix: false,
};

/** Pantalla de gestión de cuentas de la plataforma (solo super-admin). */
export const ACCOUNTS_MANAGEMENT_ENTRY: NavigationEntry = {
  id: 'accounts',
  path: '/admin/accounts',
  labelKey: 'cms.sidebar.accountsManagement',
  Icon: Users,
  matchPrefix: true,
};

/**
 * Área en la que se coloca «Gestión de cuentas». Es el nombre que da la
 * migración `20261002140000_cms_navigation_groups.sql`; si alguien la
 * renombra, la entrada pasa a mostrarse suelta bajo «Inicio».
 */
export const ACCOUNTS_AREA_NAME = 'Cuentas';

type ToolSection = Exclude<CmsSection, 'resources'>;

/** Herramientas del CMS, en el orden de la barra lateral. */
const TOOLS: Array<{ id: ToolSection; labelKey: string; Icon: LucideIcon }> = [
  { id: 'users', labelKey: 'cms.sidebar.users', Icon: UserCog },
  { id: 'storage', labelKey: 'cms.sidebar.files', Icon: FolderOpen },
  { id: 'dashboards', labelKey: 'cms.sidebar.dashboards', Icon: LayoutGrid },
  { id: 'auditLogs', labelKey: 'cms.sidebar.audit', Icon: ScrollText },
  { id: 'settings', labelKey: 'cms.sidebar.settings', Icon: Settings },
];

/** Enlace a la vista general de tablas, agrupada por área. */
const ALL_TABLES_ENTRY: NavigationEntry = {
  id: 'resources',
  path: CMS_SECTION_PATHS.resources,
  labelKey: 'cms.sidebar.allTables',
  Icon: TableProperties,
  matchPrefix: false,
};

/**
 * Calcula toda la navegación de la consola para el usuario. Mientras las
 * consultas no han respondido (o si la API rechaza el acceso: MFA pendiente,
 * cuenta inactiva) no hay áreas ni herramientas: nunca se muestra una
 * entrada que la API no haya confirmado.
 */
export function useAdminNavigation(user: JWTUserData | null) {
  const enabled = Boolean(user?.has_cms_access);

  const account = useQuery({ ...cmsQueries.account(), enabled });
  const navigation = useQuery({ ...cmsQueries.navigation(), enabled });

  const access = account.data?.access;
  const resources = access ? (navigation.data ?? []) : [];

  const visibility = getCmsSectionVisibility({
    access,
    visibleResourcesCount: getVisibleResources(resources).length,
  });

  const areas = groupResourcesByArea(resources);
  const isSuperAdmin = Boolean(user?.is_superadmin);

  return {
    showHome: isSuperAdmin,
    areas,
    /**
     * «Gestión de cuentas» va dentro del área de cuentas; si esa área no
     * existe (sin acceso al CMS o renombrada) se muestra suelta.
     */
    accountsManagement: isSuperAdmin
      ? {
          entry: ACCOUNTS_MANAGEMENT_ENTRY,
          inArea: areas.some((area) => area.name === ACCOUNTS_AREA_NAME),
        }
      : null,
    tools: TOOLS.filter((tool) => visibility[tool.id]).map(
      (tool): NavigationEntry => ({
        ...tool,
        path: CMS_SECTION_PATHS[tool.id],
        matchPrefix: true,
      }),
    ),
    allTables: visibility.resources ? ALL_TABLES_ENTRY : null,
  };
}

/**
 * Indica si una entrada está activa para la ruta actual. «Todas las tablas»
 * cuenta como activa en la portada del CMS (`/admin/cms`), que es donde se
 * listan, pero no dentro de una tabla: ahí se marca la propia tabla.
 */
export function isEntryActive(entry: NavigationEntry, pathname: string) {
  const path = pathname.replace(/\/$/, '');

  if (entry.id === ALL_TABLES_ENTRY.id) {
    return path === '/admin/cms' || path === entry.path;
  }

  return entry.matchPrefix
    ? path === entry.path || path.startsWith(`${entry.path}/`)
    : path === entry.path;
}
