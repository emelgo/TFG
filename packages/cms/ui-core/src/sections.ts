/**
 * Secciones de la interfaz del CMS y cálculo de su visibilidad.
 *
 * El grupo «CMS» de la barra lateral de la consola de administración muestra
 * una entrada por sección. Cada entrada solo aparece si la API del CMS dice
 * que el usuario puede usarla; aquí se traduce la respuesta de la API a un
 * «visible sí/no» por sección con una función pura (probada en
 * `__tests__/sections.test.ts`):
 *
 * | Sección      | Visible si…                                              |
 * |--------------|----------------------------------------------------------|
 * | `resources`  | `GET /v1/navigation` devuelve al menos una tabla visible |
 * | `users`      | `access.users` (`has_admin_permission('auth_user')`)     |
 * | `storage`    | `access.storage` (algún permiso de almacenamiento)       |
 * | `auditLogs`  | `access.auditLogs` (`has_admin_permission('log')`)       |
 * | `dashboards` | siempre que haya acceso al CMS: cada miembro tiene los   |
 * |              | suyos y la BD filtra los compartidos                     |
 * | `settings`   | siempre que haya acceso al CMS: incluye las preferencias |
 * |              | personales; sus pestañas se filtran con                  |
 * |              | `getCmsSettingsTabVisibility` (F2.7a)                    |
 *
 * Ocultar una entrada es solo ayuda visual: la autorización real la hacen la
 * API y las políticas RLS del esquema `cms`.
 *
 * [TFG] RF-09 · ADR-014: la interfaz refleja el RBAC propio del CMS.
 */

/** Identificadores de las secciones del CMS, en el orden de la barra lateral. */
export const CMS_SECTIONS = [
  'resources',
  'users',
  'storage',
  'auditLogs',
  'dashboards',
  'settings',
] as const;

export type CmsSection = (typeof CMS_SECTIONS)[number];

/**
 * Secciones y pestañas con permiso propio, tal como las devuelve
 * `GET /v1/account`. `members` y `systemSettings` son pestañas de Ajustes
 * (F2.7a): `account:select` y `system_setting` (lectura o escritura);
 * `permissions` (F2.7b), la pestaña Permisos: `role:select` o
 * `permission:select`; `resourceSettings` (F2.7c), la pestaña Recursos:
 * permiso de sistema `table` (`select` o `update`).
 */
export type CmsSectionAccess = {
  users: boolean;
  storage: boolean;
  auditLogs: boolean;
  members: boolean;
  systemSettings: boolean;
  permissions: boolean;
  resourceSettings: boolean;
};

/** Ruta de la consola de administración de cada sección. */
export const CMS_SECTION_PATHS = {
  resources: '/admin/cms/resources',
  users: '/admin/cms/users',
  storage: '/admin/cms/storage',
  auditLogs: '/admin/cms/audit-logs',
  dashboards: '/admin/cms/dashboards',
  settings: '/admin/cms/settings',
} as const satisfies Record<CmsSection, string>;

/**
 * Calcula qué secciones del CMS puede ver el usuario.
 *
 * @param params.access Secciones con permiso propio, o `null`/`undefined` si
 *   la API ha rechazado el acceso (o aún no ha respondido): en ese caso no se
 *   muestra ninguna sección.
 * @param params.visibleResourcesCount Número de tablas legibles y visibles.
 */
export function getCmsSectionVisibility(params: {
  access: CmsSectionAccess | null | undefined;
  visibleResourcesCount: number;
}): Record<CmsSection, boolean> {
  const { access, visibleResourcesCount } = params;

  if (!access) {
    return {
      resources: false,
      users: false,
      storage: false,
      auditLogs: false,
      dashboards: false,
      settings: false,
    };
  }

  return {
    resources: visibleResourcesCount > 0,
    users: access.users,
    storage: access.storage,
    auditLogs: access.auditLogs,
    dashboards: true,
    settings: true,
  };
}

/**
 * Pestañas de Ajustes del CMS (F2.7a), en el orden en que se muestran.
 *
 * | Pestaña          | Visible si…                                          |
 * |------------------|------------------------------------------------------|
 * | `general`        | siempre: preferencias personales (zona horaria…)     |
 * | `authentication` | `access.systemSettings` (permiso `system_setting`)   |
 * | `members`        | `access.members` (permiso `account:select`)          |
 * | `permissions`    | `access.permissions` (`role:select` o                |
 * |                  | `permission:select`, F2.7b)                          |
 * | `resources`      | `access.resourceSettings` (permiso de sistema        |
 * |                  | `table`, F2.7c)                                      |
 *
 * Igual que con las secciones, ocultar una pestaña es solo ayuda visual: la
 * ruta la vuelve a comprobar (404) y la API responde 403 sin el permiso.
 *
 * [TFG] RF-09 · ADR-014 · ADR-016.
 */
export const CMS_SETTINGS_TABS = [
  'general',
  'authentication',
  'members',
  'permissions',
  'resources',
] as const;

export type CmsSettingsTab = (typeof CMS_SETTINGS_TABS)[number];

/** Ruta de cada pestaña de Ajustes. */
export const CMS_SETTINGS_TAB_PATHS = {
  general: '/admin/cms/settings/general',
  authentication: '/admin/cms/settings/authentication',
  members: '/admin/cms/settings/members',
  permissions: '/admin/cms/settings/permissions',
  resources: '/admin/cms/settings/resources',
} as const satisfies Record<CmsSettingsTab, string>;

/** Calcula qué pestañas de Ajustes puede ver el usuario. */
export function getCmsSettingsTabVisibility(
  access: CmsSectionAccess | null | undefined,
): Record<CmsSettingsTab, boolean> {
  return {
    general: Boolean(access),
    authentication: access?.systemSettings === true,
    members: access?.members === true,
    permissions: access?.permissions === true,
    resources: access?.resourceSettings === true,
  };
}
