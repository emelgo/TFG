/**
 * Mensajes de error de las acciones del explorador de usuarios.
 *
 * La API responde con un código estable (`AUTH_USER_*`, ver
 * `@pymekit/cms-shared/error-codes`) y nunca con el texto de Auth o de la
 * base de datos; la interfaz elige el mensaje traducido por ese código.
 */
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

/** Claves (relativas a `cms.usersExplorer`) por código de error de la API. */
const USER_ERROR_KEYS: Record<string, string> = {
  [CMS_API_ERROR_CODES.AUTH_USER_PERMISSION_DENIED]: 'errors.permissionDenied',
  [CMS_API_ERROR_CODES.AUTH_USER_NOT_FOUND]: 'errors.notFound',
  [CMS_API_ERROR_CODES.AUTH_USER_SELF_ACTION]: 'errors.selfAction',
  [CMS_API_ERROR_CODES.AUTH_USER_PROTECTED]: 'errors.protected',
  [CMS_API_ERROR_CODES.AUTH_USER_ALREADY_EXISTS]: 'errors.alreadyExists',
  [CMS_API_ERROR_CODES.AUTH_USER_INVALID_DATA]: 'errors.invalidData',
};

/**
 * Devuelve la clave i18n (relativa a `cms.usersExplorer`) de un error, o
 * `fallback` si no trae un código conocido (un 500 o un fallo de red).
 */
export function getUserErrorKey(error: unknown, fallback: string) {
  const errorCode =
    error && typeof error === 'object' && 'errorCode' in error
      ? (error as { errorCode?: unknown }).errorCode
      : undefined;

  if (typeof errorCode === 'string' && USER_ERROR_KEYS[errorCode]) {
    return USER_ERROR_KEYS[errorCode];
  }

  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;

  // Un 403 sin código (por ejemplo, del filtro CSRF) también es «sin permiso».
  return status === 403 ? 'errors.permissionDenied' : fallback;
}
