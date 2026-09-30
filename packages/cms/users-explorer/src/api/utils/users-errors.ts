/**
 * Errores del explorador de usuarios y su traducción a respuestas HTTP.
 *
 * El código de partida devolvía al cliente el texto de Auth o de PostgreSQL
 * (`getErrorMessage`) con un 500, incluido el `SQLERRM` de las funciones de
 * acceso al CMS. Ahora el servicio lanza `UsersExplorerError` con un código
 * estable (`CMS_API_ERROR_CODES.AUTH_USER_*`) y las rutas responden con su
 * estado y un mensaje genérico; el texto original solo va al *log*.
 *
 * Es código puro para poder probarlo sin Auth ni Hono.
 *
 * [TFG] RNF-02 Seguridad: los errores internos no llegan al cliente.
 */
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import type { UserProtection } from './user-protection';

export type UsersErrorCode =
  | typeof CMS_API_ERROR_CODES.AUTH_USER_PERMISSION_DENIED
  | typeof CMS_API_ERROR_CODES.AUTH_USER_NOT_FOUND
  | typeof CMS_API_ERROR_CODES.AUTH_USER_SELF_ACTION
  | typeof CMS_API_ERROR_CODES.AUTH_USER_PROTECTED
  | typeof CMS_API_ERROR_CODES.AUTH_USER_ALREADY_EXISTS
  | typeof CMS_API_ERROR_CODES.AUTH_USER_INVALID_DATA
  | typeof CMS_API_ERROR_CODES.AUTH_USER_ACTION_FAILED;

const RESPONSES: Record<
  UsersErrorCode,
  { status: 400 | 403 | 404 | 409 | 500; message: string }
> = {
  AUTH_USER_PERMISSION_DENIED: {
    status: 403,
    message: 'You do not have permission to perform this action on users',
  },
  AUTH_USER_NOT_FOUND: { status: 404, message: 'The user was not found' },
  AUTH_USER_SELF_ACTION: {
    status: 403,
    message: 'You cannot perform this action on your own account',
  },
  AUTH_USER_PROTECTED: {
    status: 403,
    message:
      'This user is a platform super admin or CMS staff and cannot be modified here',
  },
  AUTH_USER_ALREADY_EXISTS: {
    status: 409,
    message: 'A user with this email already exists',
  },
  AUTH_USER_INVALID_DATA: {
    status: 400,
    message: 'The submitted user data is not valid',
  },
  AUTH_USER_ACTION_FAILED: {
    status: 500,
    message: 'The action could not be completed. Please try again later',
  },
};

/** Error controlado del explorador de usuarios. */
export class UsersExplorerError extends Error {
  constructor(
    readonly code: UsersErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UsersExplorerError';
  }
}

/** Crea el error que corresponde a un usuario protegido. */
export function protectionError(protection: UserProtection) {
  return protection === 'self'
    ? new UsersExplorerError(
        CMS_API_ERROR_CODES.AUTH_USER_SELF_ACTION,
        'Self action',
      )
    : new UsersExplorerError(
        CMS_API_ERROR_CODES.AUTH_USER_PROTECTED,
        `Protected user (${protection})`,
      );
}

/** Crea el error de permiso denegado. */
export function permissionDenied(action: string) {
  return new UsersExplorerError(
    CMS_API_ERROR_CODES.AUTH_USER_PERMISSION_DENIED,
    `Permission denied: ${action}`,
  );
}

/**
 * Traduce un error de la API de administración de Auth (`AuthApiError`, con
 * `status` y `code`) a un `UsersExplorerError`.
 */
export function fromAuthAdminError(
  error: { message?: string; status?: number; code?: string } | null,
  context: string,
) {
  const detail = `${context}: ${error?.message ?? 'unknown auth error'}`;
  const code = error?.code ?? '';

  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    code === 'phone_exists' ||
    (error?.status === 422 && /already.*registered/i.test(error.message ?? ''))
  ) {
    return new UsersExplorerError(
      CMS_API_ERROR_CODES.AUTH_USER_ALREADY_EXISTS,
      detail,
    );
  }

  if (code === 'user_not_found' || error?.status === 404) {
    return new UsersExplorerError(
      CMS_API_ERROR_CODES.AUTH_USER_NOT_FOUND,
      detail,
    );
  }

  if (
    code === 'weak_password' ||
    code === 'validation_failed' ||
    code === 'email_address_invalid' ||
    error?.status === 400 ||
    error?.status === 422
  ) {
    return new UsersExplorerError(
      CMS_API_ERROR_CODES.AUTH_USER_INVALID_DATA,
      detail,
    );
  }

  return new UsersExplorerError(
    CMS_API_ERROR_CODES.AUTH_USER_ACTION_FAILED,
    detail,
  );
}

/**
 * Traduce el `{ success: false, error }` de `cms.grant_admin_access` o
 * `cms.revoke_admin_access`. Esas funciones escriben mensajes fijos para los
 * rechazos esperados y el `SQLERRM` de PostgreSQL para el resto: se
 * reconocen los fijos y todo lo demás es un fallo interno sin detalles.
 */
export function fromAdminAccessFailure(message: string | undefined) {
  const text = message ?? '';

  if (/user not found/i.test(text)) {
    return new UsersExplorerError(
      CMS_API_ERROR_CODES.AUTH_USER_NOT_FOUND,
      text,
    );
  }

  if (/yourself/i.test(text)) {
    return new UsersExplorerError(
      CMS_API_ERROR_CODES.AUTH_USER_SELF_ACTION,
      text,
    );
  }

  if (/insufficient permissions|rank|not authenticated/i.test(text)) {
    return new UsersExplorerError(
      CMS_API_ERROR_CODES.AUTH_USER_PERMISSION_DENIED,
      text,
    );
  }

  return new UsersExplorerError(
    CMS_API_ERROR_CODES.AUTH_USER_ACTION_FAILED,
    text,
  );
}

/**
 * Devuelve la respuesta pública de un error: `status`, `errorCode` y un
 * mensaje genérico. Un error desconocido es siempre un 500.
 */
export function classifyUsersError(error: unknown) {
  const code =
    error instanceof UsersExplorerError
      ? error.code
      : CMS_API_ERROR_CODES.AUTH_USER_ACTION_FAILED;

  return { ...RESPONSES[code], errorCode: code };
}

/** Devuelve el código público de un error (para los resultados por usuario). */
export function getUsersErrorCode(error: unknown): UsersErrorCode {
  return classifyUsersError(error).errorCode;
}
