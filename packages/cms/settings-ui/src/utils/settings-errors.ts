/**
 * Mensajes de error de Ajustes (preferencias, MFA y miembros).
 *
 * La API responde con un código estable (`SETTINGS_*`, `MEMBER_*`, ver
 * `@pymekit/cms-shared/error-codes`) y nunca con el texto de la base de
 * datos; la interfaz elige el mensaje traducido por ese código.
 */
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

/** Claves (relativas a `cms.settings`) por código de error de la API. */
const SETTINGS_ERROR_KEYS: Record<string, string> = {
  [CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED]: 'errors.permissionDenied',
  [CMS_API_ERROR_CODES.SETTINGS_INVALID_DATA]: 'errors.invalidData',
  [CMS_API_ERROR_CODES.SETTINGS_MFA_VERIFICATION_REQUIRED]:
    'errors.mfaVerificationRequired',
  [CMS_API_ERROR_CODES.SETTINGS_MFA_DISABLE_REQUIRES_ROOT]:
    'errors.mfaDisableRequiresRoot',
  [CMS_API_ERROR_CODES.SETTINGS_RESOURCE_NOT_FOUND]: 'errors.resourceNotFound',
  [CMS_API_ERROR_CODES.SETTINGS_RESOURCE_PROTECTED_SCHEMA]:
    'errors.protectedSchema',
  [CMS_API_ERROR_CODES.MEMBER_PERMISSION_DENIED]: 'errors.permissionDenied',
  [CMS_API_ERROR_CODES.MEMBER_NOT_FOUND]: 'errors.memberNotFound',
  [CMS_API_ERROR_CODES.MEMBER_SELF_ACTION]: 'errors.selfAction',
  [CMS_API_ERROR_CODES.MEMBER_PROTECTED]: 'errors.protected',
  [CMS_API_ERROR_CODES.MEMBER_RANK_DENIED]: 'errors.rankDenied',
  [CMS_API_ERROR_CODES.MEMBER_INACTIVE]: 'errors.inactive',
  [CMS_API_ERROR_CODES.MEMBER_INVALID_DATA]: 'errors.invalidData',
};

/**
 * Devuelve la clave i18n (relativa a `cms.settings`) de un error, o
 * `fallback` si no trae un código conocido (un 500 o un fallo de red).
 */
export function getSettingsErrorKey(error: unknown, fallback: string) {
  const errorCode =
    error && typeof error === 'object' && 'errorCode' in error
      ? (error as { errorCode?: unknown }).errorCode
      : undefined;

  if (typeof errorCode === 'string' && SETTINGS_ERROR_KEYS[errorCode]) {
    return SETTINGS_ERROR_KEYS[errorCode];
  }

  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;

  // Un 403 sin código (por ejemplo, del filtro CSRF) también es «sin permiso».
  return status === 403 ? 'errors.permissionDenied' : fallback;
}
