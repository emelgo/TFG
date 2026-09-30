/**
 * Estado de un usuario y qué acciones múltiples admite.
 *
 * La interfaz no ofrece acciones sobre usuarios protegidos (uno mismo, un
 * super-admin de la plataforma o personal del CMS con acceso): la API las
 * rechazaría con 403 igualmente. Estas funciones puras deciden qué usuarios
 * seleccionados recibe cada acción múltiple.
 */
import type { UsersBatchAction } from '@pymekit/cms-ui-core/users-api';

/** Campos de un usuario que deciden su estado. */
export type UserStatusFields = {
  id: string;
  is_banned: boolean;
  is_self: boolean;
  is_super_admin: boolean;
  has_cms_access: boolean;
};

/** Indica si el explorador puede actuar sobre el usuario. */
export function isUserActionable(user: UserStatusFields) {
  return !user.is_self && !user.is_super_admin && !user.has_cms_access;
}

/**
 * Devuelve los usuarios seleccionados a los que se aplicará `action`: solo
 * los modificables y, para bloquear/desbloquear, solo los que cambian.
 */
export function getBatchActionTargets<T extends UserStatusFields>(
  users: T[],
  action: UsersBatchAction,
) {
  return users.filter((user) => {
    if (!isUserActionable(user)) {
      return false;
    }

    if (action === 'ban') {
      return !user.is_banned;
    }

    if (action === 'unban') {
      return user.is_banned;
    }

    return true;
  });
}
