/**
 * Reglas de protección de usuarios del explorador de usuarios del CMS.
 *
 * Las acciones del explorador (bloquear, borrar, restablecer la contraseña,
 * enviar un enlace de acceso, quitar un factor MFA) se ejecutan con la API de
 * administración de Supabase Auth y la **clave de servicio**, que no conoce
 * los roles del CMS: si el código no lo impidiera, cualquier miembro del
 * personal con el permiso `auth_user` podría bloquear al super-admin de la
 * plataforma, robarle la cuenta con un enlace de recuperación o borrarse a
 * sí mismo. Por eso, antes de llamar a Auth, se decide aquí si el usuario de
 * destino se puede tocar:
 *
 *  - **uno mismo**: nunca (nadie se bloquea, se borra ni cambia su propio
 *    acceso desde el CMS);
 *  - **super-admin de la plataforma** (`app_metadata.role = 'super-admin'`,
 *    el mismo criterio que `public.is_super_admin()`): nunca; se gestiona
 *    solo desde la consola de la plataforma (`/admin/accounts`);
 *  - **personal del CMS** (`app_metadata.cms_access = 'true'`): no, mientras
 *    tenga acceso. Primero hay que retirárselo con
 *    `cms.revoke_admin_access`, que comprueba la jerarquía de rangos; así
 *    nadie actúa sobre alguien de rango igual o superior;
 *  - **antiguo personal con rango superior**: retirar el acceso conserva la
 *    cuenta del CMS y sus roles (para la auditoría y por si se le vuelve a
 *    dar). Si el operador no supera ese rango (`cms.can_action_account`),
 *    tampoco puede tocarlo: de lo contrario, alguien de rango bajo podría
 *    borrar la cuenta de un administrador superior en cuanto otro le quitara
 *    el acceso.
 *
 * El explorador **nunca escribe** `app_metadata`: no hay ningún *endpoint*
 * que lo acepte. El acceso al CMS solo cambia a través de las funciones SQL
 * `cms.grant_admin_access` / `cms.revoke_admin_access`.
 *
 * Son funciones puras para poder probarlas sin Auth ni base de datos.
 *
 * [TFG] RNF-02 Seguridad: autorización en el código antes del cliente de
 * servicio de Auth (RF-09). Ver Memoria §Diseño > Seguridad del CMS.
 */

/** Motivo por el que un usuario no se puede modificar desde el CMS. */
export type UserProtection = 'self' | 'super_admin' | 'cms_staff' | 'cms_rank';

type AppMetadata = Record<string, unknown> | null | undefined;

/** Indica si el usuario es super-admin de la plataforma. */
export function isPlatformSuperAdmin(appMetadata: AppMetadata) {
  return appMetadata?.['role'] === 'super-admin';
}

/** Indica si el usuario tiene el *claim* de acceso al CMS. */
export function hasCmsAccessClaim(appMetadata: AppMetadata) {
  return appMetadata?.['cms_access'] === 'true';
}

/**
 * Devuelve por qué `target` no se puede modificar desde el CMS, o `null` si
 * se puede. El orden importa: se informa primero del motivo más fuerte.
 */
export function getUserProtection(params: {
  actorId: string;
  targetId: string;
  targetAppMetadata: AppMetadata;
  /**
   * Cuenta del CMS del destino, si tiene: `outranked` indica si el operador
   * tiene más rango que ella. `null` si nunca ha sido personal del CMS.
   */
  targetCmsAccount?: { outranked: boolean } | null;
}): UserProtection | null {
  if (params.actorId === params.targetId) {
    return 'self';
  }

  if (isPlatformSuperAdmin(params.targetAppMetadata)) {
    return 'super_admin';
  }

  if (hasCmsAccessClaim(params.targetAppMetadata)) {
    return 'cms_staff';
  }

  if (params.targetCmsAccount && !params.targetCmsAccount.outranked) {
    return 'cms_rank';
  }

  return null;
}

/**
 * Decide qué cambio de acceso al CMS se ofrece sobre un usuario. Es una ayuda
 * para la interfaz y una primera barrera en la API; la decisión final (rango
 * y permisos `account`) la toman `cms.grant_admin_access` y
 * `cms.revoke_admin_access`.
 *
 * - A uno mismo y a un super-admin, nada: el super-admin tiene el acceso por
 *   el «pegamento» de ADR-014 y solo lo pierde si deja de ser super-admin.
 * - Al resto, conceder si no lo tiene y retirar si lo tiene.
 */
export function getAdminAccessChange(params: {
  actorId: string;
  targetId: string;
  targetAppMetadata: AppMetadata;
}): 'grant' | 'revoke' | null {
  if (
    params.actorId === params.targetId ||
    isPlatformSuperAdmin(params.targetAppMetadata)
  ) {
    return null;
  }

  return hasCmsAccessClaim(params.targetAppMetadata) ? 'revoke' : 'grant';
}
