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
  id: string;
  amr: AMREntry[] | string[] | undefined;
};
