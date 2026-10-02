/**
 * Clasificación de los errores de acceso de la API del CMS.
 *
 * La interfaz del CMS tiene que reaccionar de forma distinta según por qué la
 * API rechaza una petición: sin sesión se va al inicio de sesión; si falta el
 * segundo factor o la cuenta del CMS está desactivada se muestra un aviso con
 * el enlace a la verificación; en cualquier otro 403 se responde con un 404,
 * igual que la consola de administración con quien no es personal. Se decide
 * con el `status` y el `errorCode` de la respuesta, nunca con el texto.
 */
import { ApiError } from '@pymekit/cms-api/client';
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

/**
 * Motivo por el que el usuario no puede usar el CMS:
 *
 * - `unauthenticated`: no hay sesión válida (401).
 * - `mfa_or_inactive`: tiene el *claim* pero la base de datos rechaza el
 *   acceso (sin aal2 o con la cuenta del CMS desactivada). Se puede resolver.
 * - `forbidden`: cualquier otro 403 (sin *claim*, bloqueado…).
 */
export type CmsAccessFailure =
  | 'unauthenticated'
  | 'mfa_or_inactive'
  | 'forbidden';

/**
 * Devuelve el motivo de acceso denegado de un error de la API del CMS, o
 * `null` si el error no es de acceso (por ejemplo, un 500 o un fallo de red),
 * que debe tratarse como un error genérico.
 */
export function getCmsAccessFailure(error: unknown): CmsAccessFailure | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  if (error.status === 401) {
    return 'unauthenticated';
  }

  if (error.status !== 403) {
    return null;
  }

  return error.errorCode === CMS_API_ERROR_CODES.MFA_OR_INACTIVE_ACCOUNT
    ? 'mfa_or_inactive'
    : 'forbidden';
}

/**
 * Política de reintentos de las consultas del CMS: los errores de acceso
 * (401/403) no se reintentan, porque repetir la petición no los arregla y
 * solo retrasaría el aviso al usuario. El resto se reintenta hasta 2 veces.
 */
export function shouldRetryCmsQuery(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status && error.status < 500) {
    return false;
  }

  return failureCount < 2;
}
