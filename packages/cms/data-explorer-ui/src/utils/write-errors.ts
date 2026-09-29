/**
 * Mensajes de error de las escrituras del explorador (crear, editar, borrar,
 * vincular).
 *
 * La API nunca devuelve el texto de la base de datos: acompaña cada error de
 * un código estable (`errorCode`, ver `@pymekit/cms-shared/error-codes` y las
 * rutas M2M). La interfaz elige el mensaje traducido a partir de ese código y
 * nunca a partir del texto, que podría cambiar.
 */
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

/** Claves (relativas a `cms.dataExplorer`) por código de error de la API. */
const WRITE_ERROR_KEYS: Record<string, string> = {
  [CMS_API_ERROR_CODES.RECORD_PERMISSION_DENIED]:
    'record.errors.permissionDenied',
  [CMS_API_ERROR_CODES.RECORD_NOT_FOUND]: 'record.errors.notFound',
  [CMS_API_ERROR_CODES.RECORD_DUPLICATE]: 'record.errors.duplicate',
  [CMS_API_ERROR_CODES.RECORD_REFERENCE_VIOLATION]:
    'record.errors.referenceViolation',
  [CMS_API_ERROR_CODES.RECORD_INVALID_DATA]: 'record.errors.invalidData',
  [CMS_API_ERROR_CODES.RECORD_RULE_VIOLATION]: 'record.errors.ruleViolation',
  // Códigos de las rutas de vínculos muchos a muchos.
  ALREADY_LINKED: 'record.errors.alreadyLinked',
  PERMISSION_DENIED: 'record.errors.permissionDenied',
  FK_VIOLATION: 'record.errors.referenceViolation',
  NOT_FOUND: 'record.errors.notFound',
  COLUMNS_NOT_EDITABLE: 'record.errors.columnsNotEditable',
};

/**
 * Devuelve la clave i18n (relativa a `cms.dataExplorer`) del error de una
 * escritura, o `fallback` si el error no trae un código conocido (un 500 o
 * un fallo de red).
 */
export function getWriteErrorKey(error: unknown, fallback: string) {
  const errorCode =
    error && typeof error === 'object' && 'errorCode' in error
      ? (error as { errorCode?: unknown }).errorCode
      : undefined;

  if (typeof errorCode === 'string' && WRITE_ERROR_KEYS[errorCode]) {
    return WRITE_ERROR_KEYS[errorCode];
  }

  // Un 403 sin código (por ejemplo, del filtro CSRF) también es «sin permiso».
  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;

  return status === 403 ? 'record.errors.permissionDenied' : fallback;
}
