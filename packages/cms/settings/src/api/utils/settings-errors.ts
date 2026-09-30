/**
 * Errores de los ajustes del CMS (preferencias, MFA y miembros) y su
 * traducción a respuestas HTTP.
 *
 * El código de partida respondía a cualquier fallo con un 500 y el texto del
 * error (`getErrorMessage`), que podía contener mensajes de PostgreSQL. Ahora
 * los servicios lanzan `SettingsError` con un código estable
 * (`SETTINGS_*`/`MEMBER_*` de `@pymekit/cms-shared/error-codes`) y las rutas
 * responden con su estado y un mensaje genérico; el detalle solo va al *log*.
 *
 * [TFG] RNF-02 Seguridad: los errores internos no llegan al cliente
 * (bitácora B-20). F2.7a.
 */
import {
  CMS_API_ERROR_CODES,
  type CmsApiErrorCode,
} from '@pymekit/cms-shared/error-codes';

export type SettingsErrorCode = Extract<
  CmsApiErrorCode,
  `SETTINGS_${string}` | `MEMBER_${string}`
>;

type ErrorStatus = 400 | 403 | 404 | 409 | 500;

const RESPONSES: Record<
  SettingsErrorCode,
  { status: ErrorStatus; message: string }
> = {
  SETTINGS_PERMISSION_DENIED: {
    status: 403,
    message: 'You do not have permission to change these settings',
  },
  SETTINGS_INVALID_DATA: {
    status: 400,
    message: 'The settings are not valid',
  },
  SETTINGS_MFA_VERIFICATION_REQUIRED: {
    status: 403,
    message: 'Verify your second factor before changing this setting',
  },
  SETTINGS_MFA_DISABLE_REQUIRES_ROOT: {
    status: 403,
    message: 'Only a platform super admin can stop requiring MFA',
  },
  SETTINGS_ACTION_FAILED: {
    status: 500,
    message: 'The settings could not be saved. Please try again later',
  },
  MEMBER_PERMISSION_DENIED: {
    status: 403,
    message: 'You do not have permission to manage members',
  },
  MEMBER_NOT_FOUND: {
    status: 404,
    message: 'The member was not found',
  },
  MEMBER_SELF_ACTION: {
    status: 403,
    message: 'You cannot change your own roles or status',
  },
  MEMBER_PROTECTED: {
    status: 403,
    message: 'This account is managed by the platform',
  },
  MEMBER_RANK_DENIED: {
    status: 403,
    message: 'You can only manage members and roles below your own rank',
  },
  MEMBER_INACTIVE: {
    status: 409,
    message: 'Roles cannot be assigned to a deactivated member',
  },
  MEMBER_INVALID_DATA: {
    status: 400,
    message: 'The member request is not valid',
  },
  MEMBER_ACTION_FAILED: {
    status: 500,
    message: 'The member could not be updated. Please try again later',
  },
};

/** Error controlado de los ajustes. */
export class SettingsError extends Error {
  constructor(
    readonly code: SettingsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SettingsError';
  }
}

/**
 * Devuelve la respuesta pública de un error: `status`, `errorCode` y un
 * mensaje genérico. Un error desconocido es siempre un 500 con el código
 * genérico que indique quien llama (ajustes o miembros).
 */
export function classifySettingsError(
  error: unknown,
  fallback: Extract<
    SettingsErrorCode,
    'SETTINGS_ACTION_FAILED' | 'MEMBER_ACTION_FAILED'
  > = CMS_API_ERROR_CODES.SETTINGS_ACTION_FAILED,
) {
  const controlled = findSettingsError(error);
  const code = controlled ? controlled.code : fallback;

  return { ...RESPONSES[code], errorCode: code };
}

/**
 * Busca un `SettingsError` en la cadena de causas: el cliente Drizzle
 * envuelve los errores lanzados dentro de una transacción en otro `Error`
 * con el original en `cause` (bitácora B-29).
 */
export function findSettingsError(error: unknown): SettingsError | null {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof SettingsError) {
      return current;
    }

    current = current instanceof Error ? current.cause : null;
  }

  return null;
}

/**
 * Traduce el código de `cms.set_account_active` (ver
 * `51-cms-admin-access.sql`) a un error de la API. La función solo devuelve
 * códigos fijos; cualquier otro valor es un fallo interno.
 */
export function fromSetAccountActiveCode(code: string | undefined) {
  switch (code) {
    case 'SELF_ACTION':
      return new SettingsError(
        CMS_API_ERROR_CODES.MEMBER_SELF_ACTION,
        'Cannot change own status',
      );
    case 'PROTECTED':
      return new SettingsError(
        CMS_API_ERROR_CODES.MEMBER_PROTECTED,
        'Root account is managed by the platform',
      );
    case 'PERMISSION_DENIED':
    case 'MFA_REQUIRED':
      return new SettingsError(
        CMS_API_ERROR_CODES.MEMBER_PERMISSION_DENIED,
        `set_account_active rejected: ${code}`,
      );
    case 'NOT_FOUND':
      return new SettingsError(
        CMS_API_ERROR_CODES.MEMBER_NOT_FOUND,
        'Account not found',
      );
    case 'INVALID_ARGUMENTS':
      return new SettingsError(
        CMS_API_ERROR_CODES.MEMBER_INVALID_DATA,
        'Invalid arguments',
      );
    default:
      return new SettingsError(
        CMS_API_ERROR_CODES.MEMBER_ACTION_FAILED,
        `Unexpected set_account_active result: ${code ?? 'none'}`,
      );
  }
}

/**
 * Traduce un error de PostgreSQL al guardar la configuración de MFA: la
 * guardia `cms.guard_mfa_requirement_change` lanza `42501` con un mensaje
 * fijo, y la política RLS rechaza con `42501` a quien no tiene
 * `system_setting:update`. Todo lo demás es un fallo interno.
 */
export function fromMfaConfigurationDbError(error: unknown) {
  const { code, message } = findPostgresError(error);

  if (code === '42501' && message.includes('MFA_DISABLE_REQUIRES_ROOT_AAL2')) {
    return new SettingsError(
      CMS_API_ERROR_CODES.SETTINGS_MFA_DISABLE_REQUIRES_ROOT,
      'Guard rejected disabling MFA',
    );
  }

  if (code === '42501') {
    return new SettingsError(
      CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED,
      'RLS rejected the configuration change',
    );
  }

  return null;
}

/**
 * Traduce un error de PostgreSQL al cambiar los roles de un miembro: la
 * política RLS de `cms.account_roles` (`can_modify_account_role`) rechaza
 * con `42501`, la regla de negocio con `23514` (cuenta desactivada) y la
 * unicidad con `23505` (ya tiene un rol).
 */
export function fromMemberRolesDbError(error: unknown) {
  const { code } = findPostgresError(error);

  if (code === '42501') {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_RANK_DENIED,
      'RLS rejected the role change',
    );
  }

  if (code === '23514') {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_INACTIVE,
      'Role assignment rejected by business rules',
    );
  }

  if (code === '23505' || code === '23503') {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_INVALID_DATA,
      `Role assignment rejected (${code})`,
    );
  }

  return null;
}

/**
 * Busca el SQLSTATE (`code`) y el mensaje de un error de `postgres` en la
 * cadena de causas.
 */
function findPostgresError(error: unknown) {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth++) {
    if (
      typeof current === 'object' &&
      current !== null &&
      'code' in current &&
      typeof (current as { code: unknown }).code === 'string'
    ) {
      const { code, message } = current as { code: string; message?: string };

      return { code, message: typeof message === 'string' ? message : '' };
    }

    current = current instanceof Error ? current.cause : null;
  }

  return { code: undefined, message: '' };
}
