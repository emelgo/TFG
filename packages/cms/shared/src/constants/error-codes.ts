/**
 * Códigos de error estables de la API del CMS.
 *
 * La API acompaña sus respuestas de error con un `errorCode` además del
 * mensaje. La interfaz (`/admin/cms`) decide qué pantalla mostrar a partir de
 * este código y nunca a partir del texto, que puede cambiar. Vive en
 * `@pymekit/cms-shared` porque lo importan tanto el servidor (Hono) como el
 * cliente: es un módulo sin dependencias, seguro en el *bundle* del navegador.
 */
export const CMS_API_ERROR_CODES = {
  /** No hay sesión válida (401). */
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  /** Sesión anónima o sin rol `authenticated` (403). */
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  /** Falta el *claim* `cms_access`: no es personal del CMS (403). */
  NO_CMS_ACCESS: 'NO_CMS_ACCESS',
  /** El usuario está bloqueado en Auth (403). */
  USER_BANNED: 'USER_BANNED',
  /**
   * Tiene el *claim*, pero la base de datos (`cms.verify_admin_access()`)
   * rechaza el acceso: su cuenta del CMS está desactivada o la sesión no ha
   * verificado el segundo factor (aal2) y el MFA es obligatorio (403).
   */
  MFA_OR_INACTIVE_ACCOUNT: 'CMS_MFA_OR_INACTIVE_ACCOUNT',
} as const;

export type CmsApiErrorCode =
  (typeof CMS_API_ERROR_CODES)[keyof typeof CMS_API_ERROR_CODES];
