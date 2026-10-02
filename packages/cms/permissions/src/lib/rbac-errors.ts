/**
 * Errores de Ajustes > Permisos (roles, grupos y permisos del CMS) y su
 * traducción a respuestas HTTP (F2.7b).
 *
 * Las rutas heredadas respondían a cualquier fallo con un 500 y el texto
 * del error (`getErrorMessage`), que podía llevar mensajes de PostgreSQL
 * con nombres de restricciones o reglas internas. Ahora el servicio lanza
 * `RbacError` con un código estable (`PERMISSION_*`, `ROLE_*`, `GROUP_*` de
 * `@pymekit/cms-shared/error-codes`) y las rutas responden con su estado y
 * un mensaje genérico; el detalle solo va al *log*.
 *
 * Además, `fromRbacDbError` traduce los errores que devuelve la propia base
 * de datos cuando rechaza algo que la API no había previsto (una carrera
 * con otro operador, por ejemplo): RLS o la guardia de sistema (`42501`),
 * nombres o rangos repetidos (`23505`), datos que violan una restricción
 * (`23514`, `23503`) o la comprobación de rango del *trigger* de roles.
 *
 * [TFG] RNF-02 Seguridad: los errores internos no llegan al cliente
 * (bitácora B-20). Funciones puras con tests en `__tests__`.
 */
import {
  CMS_API_ERROR_CODES,
  type CmsApiErrorCode,
} from '@pymekit/cms-shared/error-codes';

export type RbacErrorCode = Extract<
  CmsApiErrorCode,
  `PERMISSION_${string}` | `ROLE_${string}` | `GROUP_${string}`
>;

type ErrorStatus = 400 | 403 | 404 | 409 | 500;

const RESPONSES: Record<
  RbacErrorCode,
  { status: ErrorStatus; message: string }
> = {
  PERMISSION_ACCESS_DENIED: {
    status: 403,
    message: 'You do not have permission to manage roles and permissions',
  },
  PERMISSION_INVALID_DATA: { status: 400, message: 'The request is not valid' },
  PERMISSION_NOT_FOUND: {
    status: 404,
    message: 'The permission was not found',
  },
  PERMISSION_NAME_TAKEN: {
    status: 409,
    message: 'A permission with this name already exists',
  },
  PERMISSION_NOT_GRANTABLE: {
    status: 403,
    message: 'You can only grant capabilities that you already have',
  },
  PERMISSION_RANK_DENIED: {
    status: 403,
    message: 'This permission is used by a role at or above your rank',
  },
  PERMISSION_IN_USE: {
    status: 409,
    message: 'The permission is still assigned and cannot be deleted',
  },
  PERMISSION_SYSTEM_PROTECTED: {
    status: 403,
    message: 'System permissions are managed by the platform',
  },
  PERMISSION_ACTION_FAILED: {
    status: 500,
    message: 'The request could not be completed. Please try again later',
  },
  ROLE_NOT_FOUND: { status: 404, message: 'The role was not found' },
  ROLE_NAME_TAKEN: {
    status: 409,
    message: 'A role with this name already exists',
  },
  ROLE_RANK_TAKEN: {
    status: 409,
    message: 'Another role already has this rank',
  },
  ROLE_RANK_DENIED: {
    status: 403,
    message: 'You can only manage roles below your own rank',
  },
  ROLE_HAS_MEMBERS: {
    status: 409,
    message: 'Reassign the members of this role before deleting it',
  },
  ROLE_SYSTEM_PROTECTED: {
    status: 403,
    message: 'The system role is managed by the platform',
  },
  GROUP_NOT_FOUND: {
    status: 404,
    message: 'The permission group was not found',
  },
  GROUP_NAME_TAKEN: {
    status: 409,
    message: 'A permission group with this name already exists',
  },
  GROUP_RANK_DENIED: {
    status: 403,
    message: 'This permission group is used by a role you cannot manage',
  },
  GROUP_SYSTEM_PROTECTED: {
    status: 403,
    message: 'The system permission group is managed by the platform',
  },
};

/** Error controlado de la gestión de roles, grupos y permisos. */
export class RbacError extends Error {
  constructor(
    readonly code: RbacErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RbacError';
  }
}

/**
 * Devuelve la respuesta pública de un error: `status`, `errorCode` y un
 * mensaje genérico. Un error desconocido es siempre un 500
 * (`PERMISSION_ACTION_FAILED`).
 */
export function classifyRbacError(error: unknown) {
  const controlled = findRbacError(error);
  const code = controlled
    ? controlled.code
    : CMS_API_ERROR_CODES.PERMISSION_ACTION_FAILED;

  return { ...RESPONSES[code], errorCode: code };
}

/**
 * Busca un `RbacError` en la cadena de causas: el cliente Drizzle envuelve
 * los errores lanzados dentro de una transacción en otro `Error` con el
 * original en `cause` (bitácora B-29).
 */
export function findRbacError(error: unknown): RbacError | null {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof RbacError) {
      return current;
    }

    current = current instanceof Error ? current.cause : null;
  }

  return null;
}

/** Sobre qué se estaba actuando cuando falló la base de datos. */
export type RbacErrorSubject = 'role' | 'group' | 'permission';

/**
 * Traduce un error de PostgreSQL a un `RbacError`, o devuelve `null` si no
 * es uno de los esperados (y entonces se responde con un 500 genérico).
 *
 *  - `42501` con el mensaje fijo `SYSTEM_RBAC_OBJECT_PROTECTED`: la guardia
 *    de los objetos de sistema (`55-cms-rbac-hardening.sql`).
 *  - `42501` de `enforce_permission_reshape_grantable`: el permiso se
 *    ensancharía a una capacidad que no se tiene.
 *  - Otro `42501`: la política RLS ha rechazado la fila (permiso de sistema
 *    o rango).
 *  - `23505`: nombre o rango repetidos, según la restricción.
 *  - `23514`/`23503`/`22P02`: datos no válidos para las restricciones.
 *  - `P0001` con el texto del *trigger* de rango de roles.
 */
export function fromRbacDbError(
  error: unknown,
  subject: RbacErrorSubject,
): RbacError | null {
  // Un rechazo controlado del propio servicio ya lleva su código.
  if (findRbacError(error)) {
    return null;
  }

  const pg = findPostgresError(error);

  if (!pg) {
    return null;
  }

  const { code, message, constraint } = pg;

  if (code === '42501' && message.includes('SYSTEM_RBAC_OBJECT_PROTECTED')) {
    return new RbacError(
      subject === 'role'
        ? CMS_API_ERROR_CODES.ROLE_SYSTEM_PROTECTED
        : subject === 'group'
          ? CMS_API_ERROR_CODES.GROUP_SYSTEM_PROTECTED
          : CMS_API_ERROR_CODES.PERMISSION_SYSTEM_PROTECTED,
      'System RBAC object guard rejected the change',
    );
  }

  if (code === '42501' && message.includes('cannot reshape')) {
    return new RbacError(
      CMS_API_ERROR_CODES.PERMISSION_NOT_GRANTABLE,
      'Reshape guard rejected the change',
    );
  }

  if (code === '42501') {
    return new RbacError(
      CMS_API_ERROR_CODES.PERMISSION_ACCESS_DENIED,
      `RLS rejected the ${subject} change`,
    );
  }

  if (code === '23505') {
    if (constraint === 'roles_rank_unique') {
      return new RbacError(CMS_API_ERROR_CODES.ROLE_RANK_TAKEN, 'Rank taken');
    }

    if (constraint === 'roles_name_key') {
      return new RbacError(CMS_API_ERROR_CODES.ROLE_NAME_TAKEN, 'Name taken');
    }

    if (constraint === 'permission_groups_name_key') {
      return new RbacError(CMS_API_ERROR_CODES.GROUP_NAME_TAKEN, 'Name taken');
    }

    if (
      constraint === 'permissions_name_unique' ||
      constraint === 'permissions_name_key'
    ) {
      return new RbacError(
        CMS_API_ERROR_CODES.PERMISSION_NAME_TAKEN,
        'Name taken',
      );
    }

    return new RbacError(
      CMS_API_ERROR_CODES.PERMISSION_INVALID_DATA,
      `Unique violation (${constraint ?? 'unknown'})`,
    );
  }

  if (code === '23514' || code === '23503' || code === '22P02') {
    return new RbacError(
      CMS_API_ERROR_CODES.PERMISSION_INVALID_DATA,
      `Constraint violation (${code})`,
    );
  }

  if (code === 'P0001' && message.includes('ROLE_HAS_MEMBERS')) {
    return new RbacError(
      CMS_API_ERROR_CODES.ROLE_HAS_MEMBERS,
      'Role still has members (database guard)',
    );
  }

  if (code === 'P0001' && message.includes('rank higher than or equal')) {
    return new RbacError(
      CMS_API_ERROR_CODES.ROLE_RANK_DENIED,
      'Role rank trigger rejected the change',
    );
  }

  // `can_modify_permission_group_permissions` lanza excepciones en lugar de
  // devolver `false` cuando la política la evalúa.
  if (
    code === 'P0001' &&
    (message.includes('cannot modify this permission group') ||
      message.includes('manage permission groups') ||
      message.includes('does not have any roles'))
  ) {
    return new RbacError(
      CMS_API_ERROR_CODES.GROUP_RANK_DENIED,
      'Group guard rejected the change',
    );
  }

  return null;
}

/**
 * Devuelve el SQLSTATE de un error de PostgreSQL (buscándolo en la cadena
 * de causas), o `undefined` si no lo es.
 */
export function getPostgresErrorCode(error: unknown) {
  return findPostgresError(error)?.code;
}

/**
 * Busca el SQLSTATE (`code`), el mensaje y la restricción de un error de
 * `postgres` en la cadena de causas.
 */
function findPostgresError(error: unknown) {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth++) {
    if (
      typeof current === 'object' &&
      current !== null &&
      !(current instanceof RbacError) &&
      'code' in current &&
      typeof (current as { code: unknown }).code === 'string'
    ) {
      const value = current as {
        code: string;
        message?: unknown;
        constraint_name?: unknown;
      };

      return {
        code: value.code,
        message: typeof value.message === 'string' ? value.message : '',
        constraint:
          typeof value.constraint_name === 'string'
            ? value.constraint_name
            : undefined,
      };
    }

    current = current instanceof Error ? current.cause : null;
  }

  return null;
}
