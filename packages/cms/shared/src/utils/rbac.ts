/**
 * Reglas compartidas del RBAC del CMS (roles, grupos de permisos y
 * permisos), F2.7b.
 *
 * Los formularios de Ajustes > Permisos validan en el navegador para avisar
 * antes de enviar, y la API (`@pymekit/cms-permissions`) vuelve a validar
 * con esquemas Zod estrictos, que son la autoridad. Para que las dos capas
 * no diverjan, las listas de valores y los formatos viven aquí: son
 * constantes y funciones puras sin dependencias, seguras en el *bundle* del
 * navegador. Los valores de las listas son los de los tipos enumerados SQL
 * de `21-cms-enums.sql`.
 *
 * [TFG] RF-09 · RNF-02 · ADR-015.
 */

/** Recursos de sistema del CMS (`cms.system_resource`). */
export const RBAC_SYSTEM_RESOURCES = [
  'account',
  'role',
  'permission',
  'log',
  'table',
  'auth_user',
  'system_setting',
] as const;

export type RbacSystemResource = (typeof RBAC_SYSTEM_RESOURCES)[number];

/** Acciones (`cms.system_action`); `*` son todas. */
export const RBAC_ACTIONS = [
  '*',
  'select',
  'insert',
  'update',
  'delete',
] as const;

export type RbacAction = (typeof RBAC_ACTIONS)[number];

/** Ámbitos de un permiso de datos (`cms.permission_scope`). */
export const RBAC_DATA_SCOPES = ['table', 'column', 'storage'] as const;

export type RbacDataScope = (typeof RBAC_DATA_SCOPES)[number];

/** Rango máximo de un rol (restricción `rank <= 100` de `cms.roles`). */
export const RBAC_MAX_RANK = 100;

/** Longitudes máximas (las de las columnas SQL). */
export const RBAC_LIMITS = {
  roleName: 50,
  roleDescription: 500,
  groupName: 100,
  groupDescription: 1000,
  permissionName: 100,
  permissionDescription: 500,
  identifier: 64,
  bucketName: 100,
  pathPattern: 500,
  /** Cambios de asignación por petición (añadir + quitar). */
  assignmentBatch: 50,
} as const;

/**
 * Identificador SQL de esquema, tabla o columna, o el comodín `*`: la misma
 * forma que exigen las restricciones `permissions_*_name_check`.
 */
const IDENTIFIER_OR_WILDCARD = /^(?:\*|[a-zA-Z_][a-zA-Z0-9_]*)$/;

/**
 * Nombre de *bucket* de Supabase Storage (minúsculas, dígitos, `.`, `_` y
 * `-`) o el comodín `*`.
 */
const BUCKET_OR_WILDCARD = /^(?:\*|[a-z0-9][a-z0-9._-]*)$/;

/** Indica si `value` es un identificador SQL válido o `*`. */
export function isRbacIdentifier(value: string) {
  return (
    value.length > 0 &&
    value.length <= RBAC_LIMITS.identifier &&
    IDENTIFIER_OR_WILDCARD.test(value)
  );
}

/** Indica si `value` es un nombre de *bucket* válido o `*`. */
export function isRbacBucketName(value: string) {
  return (
    value.length > 0 &&
    value.length <= RBAC_LIMITS.bucketName &&
    BUCKET_OR_WILDCARD.test(value)
  );
}

/**
 * Indica si `value` es un patrón de ruta de almacenamiento válido.
 *
 * El patrón usa `*` como comodín y admite las variables `{{user_id}}` y
 * `{{account_id}}` (las sustituye `cms.has_storage_permission`). Debe ser
 * EXPLÍCITO: un patrón vacío ya no significa «todo» (ADR-015, F2.7b), así
 * que para dar acceso a cualquier ruta hay que escribir `*`. Se rechazan
 * las rutas absolutas, los segmentos `..`, las barras invertidas y los
 * caracteres de control, que no tienen sentido en una ruta de Storage.
 */
export function isRbacPathPattern(value: string) {
  if (value.length === 0 || value.length > RBAC_LIMITS.pathPattern) {
    return false;
  }

  if (value.startsWith('/') || value.includes('\\')) {
    return false;
  }

  // Caracteres de control (U+0000–U+001F y U+007F).
  for (const char of value) {
    const code = char.charCodeAt(0);

    if (code < 0x20 || code === 0x7f) {
      return false;
    }
  }

  return value.split('/').every((segment) => segment !== '..');
}

/**
 * Indica si un rango es asignable por quien tiene `maxRank` como rango
 * máximo: entero entre 0 y 100 y ESTRICTAMENTE inferior al suyo (la regla
 * de la política `insert_roles` y del *trigger*
 * `update_account_roles_rank_check`).
 */
export function isAssignableRank(rank: number, maxRank: number | null) {
  return (
    Number.isInteger(rank) &&
    rank >= 0 &&
    rank <= RBAC_MAX_RANK &&
    maxRank !== null &&
    rank < maxRank
  );
}
