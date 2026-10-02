/**
 * Mensajes de error de los paneles (F2.8).
 *
 * La API responde con un código estable (`DASHBOARD_*`, ver
 * `@pymekit/cms-shared/error-codes`) y nunca con el texto de la base de
 * datos; la interfaz elige el mensaje traducido por ese código.
 */
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

/** Claves (relativas a `cms.dashboards`) por código de error de la API. */
const DASHBOARD_ERROR_KEYS: Record<string, string> = {
  [CMS_API_ERROR_CODES.DASHBOARD_NOT_FOUND]: 'errors.notFound',
  [CMS_API_ERROR_CODES.DASHBOARD_FORBIDDEN]: 'errors.forbidden',
  [CMS_API_ERROR_CODES.DASHBOARD_INVALID_DATA]: 'errors.invalidData',
  [CMS_API_ERROR_CODES.DASHBOARD_SHARE_RANK_DENIED]: 'errors.shareRankDenied',
  [CMS_API_ERROR_CODES.DASHBOARD_WIDGET_NOT_FOUND]: 'errors.widgetNotFound',
  [CMS_API_ERROR_CODES.DASHBOARD_WIDGET_NO_ACCESS]: 'errors.widgetNoAccess',
  [CMS_API_ERROR_CODES.DASHBOARD_WIDGET_INVALID_SOURCE]:
    'errors.widgetInvalidSource',
};

function readProperty(error: unknown, key: 'errorCode' | 'status') {
  return error && typeof error === 'object' && key in error
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Devuelve la clave i18n (relativa a `cms.dashboards`) de un error, o
 * `fallback` si no trae un código conocido (un 500 o un fallo de red).
 */
export function getDashboardErrorKey(error: unknown, fallback: string) {
  const errorCode = readProperty(error, 'errorCode');

  if (typeof errorCode === 'string' && DASHBOARD_ERROR_KEYS[errorCode]) {
    return DASHBOARD_ERROR_KEYS[errorCode];
  }

  // Un 403 sin código (por ejemplo, del filtro CSRF) también es «sin permiso».
  return readProperty(error, 'status') === 403 ? 'errors.forbidden' : fallback;
}

/**
 * ¿El usuario no puede leer la tabla del *widget*? Ese *widget* se pinta
 * como «sin acceso» en lugar de como un error.
 */
export function isWidgetNoAccessError(error: unknown) {
  return (
    readProperty(error, 'errorCode') ===
    CMS_API_ERROR_CODES.DASHBOARD_WIDGET_NO_ACCESS
  );
}
