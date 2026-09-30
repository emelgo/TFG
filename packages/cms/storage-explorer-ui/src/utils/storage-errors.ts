/**
 * Mensajes de error del explorador de almacenamiento por código estable de
 * la API (`STORAGE_*`); nunca se muestra el texto de Storage.
 */
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

/** Claves (relativas a `cms.storageExplorer`) por código de error. */
const STORAGE_ERROR_KEYS: Record<string, string> = {
  [CMS_API_ERROR_CODES.STORAGE_PERMISSION_DENIED]: 'errors.permissionDenied',
  [CMS_API_ERROR_CODES.STORAGE_INVALID_PATH]: 'errors.invalidPath',
  [CMS_API_ERROR_CODES.STORAGE_NOT_FOUND]: 'errors.notFound',
  [CMS_API_ERROR_CODES.STORAGE_ALREADY_EXISTS]: 'errors.alreadyExists',
  [CMS_API_ERROR_CODES.STORAGE_FILE_TOO_LARGE]: 'errors.fileTooLarge',
  [CMS_API_ERROR_CODES.STORAGE_TOO_MANY_FILES]: 'errors.tooManyFiles',
};

/**
 * Devuelve la clave i18n (relativa a `cms.storageExplorer`) de un error, o
 * `fallback` si no trae un código conocido.
 */
export function getStorageErrorKey(error: unknown, fallback: string) {
  const errorCode =
    error && typeof error === 'object' && 'errorCode' in error
      ? (error as { errorCode?: unknown }).errorCode
      : undefined;

  if (typeof errorCode === 'string' && STORAGE_ERROR_KEYS[errorCode]) {
    return STORAGE_ERROR_KEYS[errorCode];
  }

  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;

  return status === 403 ? 'errors.permissionDenied' : fallback;
}
