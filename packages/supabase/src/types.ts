import type {
  AMREntry,
  AuthenticatorAssuranceLevels,
} from '@supabase/supabase-js';

/**
 * @name JWTUserData
 * @description The user data mapped from the JWT claims.
 */
export type JWTUserData = {
  is_anonymous: boolean;
  aal: AuthenticatorAssuranceLevels;
  email: string | undefined;
  phone: string | undefined;
  is_superadmin: boolean;
  /**
   * Indica si el usuario forma parte del personal del CMS: la base de datos
   * le ha concedido el *claim* `app_metadata.cms_access = 'true'` (a los
   * super-admins de forma automática y al resto del personal con el RBAC del
   * CMS). Solo sirve para decidir qué se muestra en la interfaz; la API del
   * CMS y las políticas RLS vuelven a comprobar la cuenta activa y el MFA.
   *
   * [TFG] ADR-014 · RF-09.
   */
  has_cms_access: boolean;
  id: string;
  amr: AMREntry[] | string[] | undefined;
};
