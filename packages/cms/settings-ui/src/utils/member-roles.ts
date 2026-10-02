/**
 * Cálculo del cambio de rol de un miembro (lógica pura, con pruebas).
 *
 * Una cuenta del CMS tiene como mucho un rol (`unique (account_id)` en
 * `cms.account_roles`), así que el diálogo solo elige «qué rol tendrá»; esta
 * función lo traduce a lo que espera la API (`rolesToAdd`/`rolesToRemove`).
 */
import type { MemberRolesChange } from '@pymekit/cms-ui-core/settings-api';

/**
 * Devuelve el cambio necesario para pasar de `currentRoleId` a
 * `nextRoleId` (`null` = sin rol), o `null` si no hay nada que cambiar.
 */
export function buildMemberRolesChange(
  currentRoleId: string | null,
  nextRoleId: string | null,
): MemberRolesChange | null {
  if (currentRoleId === nextRoleId) {
    return null;
  }

  return {
    rolesToAdd: nextRoleId ? [nextRoleId] : [],
    rolesToRemove: currentRoleId ? [currentRoleId] : [],
  };
}
