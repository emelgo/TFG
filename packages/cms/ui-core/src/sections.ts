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
 * |              | personales; las pestañas de gestión se filtran en F2.7   |
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

/** Secciones con permiso propio, tal como las devuelve `GET /v1/account`. */
export type CmsSectionAccess = {
  users: boolean;
  storage: boolean;
  auditLogs: boolean;
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
