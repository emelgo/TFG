/**
 * Lógica pura de Ajustes > Permisos (F2.7b): *search params* de la
 * pantalla, formularios de roles, grupos y permisos, rangos disponibles,
 * cálculo de asignaciones y mensajes por código de error.
 *
 * Los formatos (identificadores, *buckets*, patrones, rango) son los de
 * `@pymekit/cms-shared/rbac`, los mismos que valida la API con sus
 * esquemas Zod estrictos: el formulario avisa antes de enviar y la API
 * sigue siendo la autoridad. Los mensajes de validación son claves i18n
 * completas (`FieldError` las traduce).
 *
 * [TFG] RF-09 · RNF-02 · ADR-013 · ADR-015. Tests en
 * `__tests__/rbac-forms.test.ts`.
 */
import * as z from 'zod';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import {
  RBAC_ACTIONS,
  RBAC_LIMITS,
  RBAC_MAX_RANK,
  RBAC_SYSTEM_RESOURCES,
  isAssignableRank,
  isRbacBucketName,
  isRbacIdentifier,
  isRbacPathPattern,
} from '@pymekit/cms-shared/rbac';
import type { CmsRbacPermission } from '@pymekit/cms-ui-core/api';
import type {
  RbacAssignmentChanges,
  RbacPermissionInput,
} from '@pymekit/cms-ui-core/permissions-api';

const ERRORS = 'cms.settings.permissions.form.errors';

// -----------------------------------------------------------------------------
// Search params de `/admin/cms/settings/permissions`
// -----------------------------------------------------------------------------

/** Pestañas de la pantalla de permisos, en el orden en que se muestran. */
export const RBAC_TABS = ['roles', 'groups', 'permissions'] as const;

export type RbacTab = (typeof RBAC_TABS)[number];

/**
 * Pestaña y filtro de texto viven en la URL. Un valor no válido escrito a
 * mano se descarta con `.catch` en lugar de romper la página.
 */
export const RbacSearchSchema = z.object({
  tab: z.enum(RBAC_TABS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export type RbacSearch = z.infer<typeof RbacSearchSchema>;

/**
 * Pestaña que se muestra: la pedida si el usuario puede verla y, si no, la
 * primera visible (los roles exigen `role:select`; grupos y permisos,
 * `permission:select`).
 */
export function resolveRbacTab(
  requested: RbacTab | undefined,
  access: { canReadRoles: boolean; canReadPermissions: boolean },
): RbacTab {
  const visible = RBAC_TABS.filter((tab) =>
    tab === 'roles' ? access.canReadRoles : access.canReadPermissions,
  );

  return requested && visible.includes(requested)
    ? requested
    : (visible[0] ?? 'roles');
}

/**
 * Filtra una lista por texto (sin distinguir mayúsculas) en los campos
 * indicados.
 */
export function filterByQuery<T>(
  items: readonly T[],
  query: string | undefined,
  fields: (item: T) => Array<string | null | undefined>,
) {
  const term = query?.trim().toLowerCase();

  if (!term) {
    return [...items];
  }

  return items.filter((item) =>
    fields(item).some((value) => value?.toLowerCase().includes(term)),
  );
}

// -----------------------------------------------------------------------------
// Roles
// -----------------------------------------------------------------------------

/**
 * Rangos que se pueden elegir para un rol: estrictamente inferiores al
 * propio y libres (el rango es único), más el actual del rol que se edita.
 * De mayor a menor, para que el primero sea el más alto disponible.
 */
export function getAvailableRanks(params: {
  maxRank: number | null;
  takenRanks: readonly number[];
  currentRank?: number;
}) {
  const taken = new Set(params.takenRanks);
  const ranks: number[] = [];

  for (let rank = RBAC_MAX_RANK; rank >= 0; rank--) {
    if (!isAssignableRank(rank, params.maxRank)) {
      continue;
    }

    if (!taken.has(rank) || rank === params.currentRank) {
      ranks.push(rank);
    }
  }

  return ranks;
}

/** Esquema del formulario de rol (el rango llega como texto del `select`). */
export function createRoleFormSchema(maxRank: number | null) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, `${ERRORS}.nameRequired`)
      .max(RBAC_LIMITS.roleName, `${ERRORS}.nameTooLong`),
    description: z
      .string()
      .max(RBAC_LIMITS.roleDescription, `${ERRORS}.descriptionTooLong`),
    rank: z
      .string()
      .min(1, `${ERRORS}.rankRequired`)
      .refine(
        (value) => isAssignableRank(Number(value), maxRank),
        `${ERRORS}.rankNotAllowed`,
      ),
  });
}

/** Esquema del formulario de grupo. */
export const GroupFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, `${ERRORS}.nameRequired`)
    .max(RBAC_LIMITS.groupName, `${ERRORS}.nameTooLong`),
  description: z
    .string()
    .max(RBAC_LIMITS.groupDescription, `${ERRORS}.descriptionTooLong`),
});

/** Descripción del formulario → valor de la API (vacía → `null`). */
export function toNullableDescription(value: string) {
  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

// -----------------------------------------------------------------------------
// Permisos
// -----------------------------------------------------------------------------

/**
 * Tipo del formulario de permisos: «sistema» o uno de los ámbitos de
 * datos. Un solo campo evita combinaciones que la API rechazaría.
 */
export const PERMISSION_KINDS = [
  'system',
  'table',
  'column',
  'storage',
] as const;

export type PermissionKind = (typeof PERMISSION_KINDS)[number];

/** Valores del formulario de permisos (todos texto, como los controles). */
export const PermissionFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, `${ERRORS}.nameRequired`)
      .max(RBAC_LIMITS.permissionName, `${ERRORS}.nameTooLong`),
    description: z
      .string()
      .max(RBAC_LIMITS.permissionDescription, `${ERRORS}.descriptionTooLong`),
    kind: z.enum(PERMISSION_KINDS),
    action: z.enum(RBAC_ACTIONS),
    systemResource: z.string(),
    schemaName: z.string(),
    tableName: z.string(),
    columnName: z.string(),
    bucketName: z.string(),
    pathPattern: z.string(),
  })
  .superRefine((values, ctx) => {
    const require = (
      ok: boolean,
      path: keyof typeof values,
      message: string,
    ) => {
      if (!ok) {
        ctx.addIssue({ code: 'custom', path: [path], message });
      }
    };

    if (values.kind === 'system') {
      require((RBAC_SYSTEM_RESOURCES as readonly string[]).includes(
        values.systemResource,
      ), 'systemResource', `${ERRORS}.resourceRequired`);

      return;
    }

    if (values.kind === 'storage') {
      require(isRbacBucketName(
        values.bucketName.trim(),
      ), 'bucketName', `${ERRORS}.bucketInvalid`);
      require(isRbacPathPattern(
        values.pathPattern.trim(),
      ), 'pathPattern', `${ERRORS}.pathInvalid`);

      return;
    }

    require(isRbacIdentifier(
      values.schemaName,
    ), 'schemaName', `${ERRORS}.schemaRequired`);
    require(isRbacIdentifier(
      values.tableName,
    ), 'tableName', `${ERRORS}.tableRequired`);

    if (values.kind === 'column') {
      require(isRbacIdentifier(
        values.columnName,
      ), 'columnName', `${ERRORS}.columnRequired`);
    }
  });

export type PermissionFormValues = z.infer<typeof PermissionFormSchema>;

/** Valores iniciales del formulario para crear un permiso. */
export const EMPTY_PERMISSION_FORM: PermissionFormValues = {
  name: '',
  description: '',
  kind: 'table',
  action: 'select',
  systemResource: '',
  schemaName: '',
  tableName: '',
  columnName: '',
  bucketName: '',
  pathPattern: '',
};

/** Tipo de formulario que corresponde a un permiso guardado. */
export function getPermissionKind(permission: {
  permissionType: string;
  scope: string | null;
}): PermissionKind {
  if (permission.permissionType === 'system') {
    return 'system';
  }

  return permission.scope === 'column' || permission.scope === 'storage'
    ? permission.scope
    : 'table';
}

/** Valores del formulario para editar un permiso guardado. */
export function permissionToFormValues(
  permission: CmsRbacPermission,
): PermissionFormValues {
  return {
    name: permission.name,
    description: permission.description ?? '',
    kind: getPermissionKind(permission),
    action: (RBAC_ACTIONS as readonly string[]).includes(permission.action)
      ? (permission.action as PermissionFormValues['action'])
      : 'select',
    systemResource: permission.systemResource ?? '',
    schemaName: permission.schemaName ?? '',
    tableName: permission.tableName ?? '',
    columnName: permission.columnName ?? '',
    bucketName: permission.bucketName ?? '',
    pathPattern: permission.pathPattern ?? '',
  };
}

/**
 * Convierte los valores (ya validados) en el cuerpo de la API: solo los
 * campos de la forma elegida, nunca `metadata`.
 */
export function toPermissionInput(
  values: PermissionFormValues,
): RbacPermissionInput {
  const base = {
    name: values.name.trim(),
    description: toNullableDescription(values.description),
    action: values.action,
  };

  switch (values.kind) {
    case 'system':
      return {
        ...base,
        permissionType: 'system',
        systemResource: values.systemResource as Extract<
          RbacPermissionInput,
          { permissionType: 'system' }
        >['systemResource'],
      };
    case 'storage':
      return {
        ...base,
        permissionType: 'data',
        scope: 'storage',
        bucketName: values.bucketName.trim(),
        pathPattern: values.pathPattern.trim(),
      };
    case 'column':
      return {
        ...base,
        permissionType: 'data',
        scope: 'column',
        schemaName: values.schemaName,
        tableName: values.tableName,
        columnName: values.columnName,
      };
    default:
      return {
        ...base,
        permissionType: 'data',
        scope: 'table',
        schemaName: values.schemaName,
        tableName: values.tableName,
      };
  }
}

/**
 * Objetivo de un permiso en texto corto para las tablas y fichas:
 * `role`, `public.orders`, `public.orders.email` o `docs:team/*`.
 */
export function describePermissionTarget(permission: {
  permissionType: string;
  systemResource: string | null;
  scope: string | null;
  schemaName: string | null;
  tableName: string | null;
  columnName: string | null;
  bucketName: string | null;
  pathPattern: string | null;
}) {
  if (permission.permissionType === 'system') {
    return permission.systemResource ?? '—';
  }

  if (permission.scope === 'storage') {
    return `${permission.bucketName ?? '?'}:${permission.pathPattern ?? '?'}`;
  }

  return [permission.schemaName, permission.tableName, permission.columnName]
    .filter(Boolean)
    .join('.');
}

// -----------------------------------------------------------------------------
// Asignaciones
// -----------------------------------------------------------------------------

/**
 * Cambios que envía el diálogo de asignar: los seleccionados que aún no
 * estaban. Devuelve `null` si no hay nada que enviar.
 */
export function buildAssignmentChanges(
  currentIds: readonly string[],
  selectedIds: readonly string[],
): RbacAssignmentChanges | null {
  const current = new Set(currentIds);
  const toAdd = [...new Set(selectedIds)].filter((id) => !current.has(id));

  return toAdd.length > 0 ? { toAdd, toRemove: [] } : null;
}

// -----------------------------------------------------------------------------
// Errores
// -----------------------------------------------------------------------------

/** Claves (relativas a `cms.settings.permissions`) por código de la API. */
const RBAC_ERROR_KEYS: Record<string, string> = {
  [CMS_API_ERROR_CODES.PERMISSION_ACCESS_DENIED]: 'errors.accessDenied',
  [CMS_API_ERROR_CODES.PERMISSION_INVALID_DATA]: 'errors.invalidData',
  [CMS_API_ERROR_CODES.PERMISSION_NOT_FOUND]: 'errors.notFound',
  [CMS_API_ERROR_CODES.PERMISSION_NAME_TAKEN]: 'errors.nameTaken',
  [CMS_API_ERROR_CODES.PERMISSION_NOT_GRANTABLE]: 'errors.notGrantable',
  [CMS_API_ERROR_CODES.PERMISSION_RANK_DENIED]: 'errors.permissionRankDenied',
  [CMS_API_ERROR_CODES.PERMISSION_IN_USE]: 'errors.permissionInUse',
  [CMS_API_ERROR_CODES.PERMISSION_SYSTEM_PROTECTED]: 'errors.systemProtected',
  [CMS_API_ERROR_CODES.ROLE_NOT_FOUND]: 'errors.notFound',
  [CMS_API_ERROR_CODES.ROLE_NAME_TAKEN]: 'errors.nameTaken',
  [CMS_API_ERROR_CODES.ROLE_RANK_TAKEN]: 'errors.rankTaken',
  [CMS_API_ERROR_CODES.ROLE_RANK_DENIED]: 'errors.roleRankDenied',
  [CMS_API_ERROR_CODES.ROLE_HAS_MEMBERS]: 'errors.roleHasMembers',
  [CMS_API_ERROR_CODES.ROLE_SYSTEM_PROTECTED]: 'errors.systemProtected',
  [CMS_API_ERROR_CODES.GROUP_NOT_FOUND]: 'errors.notFound',
  [CMS_API_ERROR_CODES.GROUP_NAME_TAKEN]: 'errors.nameTaken',
  [CMS_API_ERROR_CODES.GROUP_RANK_DENIED]: 'errors.groupRankDenied',
  [CMS_API_ERROR_CODES.GROUP_SYSTEM_PROTECTED]: 'errors.systemProtected',
};

/**
 * Devuelve la clave i18n (relativa a `cms.settings.permissions`) de un
 * error, o `errors.generic` si no trae un código conocido (un 500 o un
 * fallo de red).
 */
export function getRbacErrorKey(error: unknown) {
  const errorCode =
    error && typeof error === 'object' && 'errorCode' in error
      ? (error as { errorCode?: unknown }).errorCode
      : undefined;

  if (typeof errorCode === 'string' && RBAC_ERROR_KEYS[errorCode]) {
    return RBAC_ERROR_KEYS[errorCode];
  }

  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;

  // Un 403 sin código (por ejemplo, del filtro CSRF) también es «sin permiso».
  return status === 403 ? 'errors.accessDenied' : 'errors.generic';
}
