import type { SupabaseClient } from '@supabase/supabase-js';

import {
  checkRequiresMultiFactorAuthentication,
  checkTokenRequiresMultiFactorAuthentication,
} from './check-requires-mfa';
import type { JWTUserData } from './types';

type SuccessResult = {
  error: null;
  data: JWTUserData;
};

type AuthenticationErrorResult = {
  error: AuthenticationError;
  data: null;
  redirectTo: string;
};

type MultiAuthErrorResult = {
  error: MultiFactorAuthError;
  data: null;
  redirectTo: string;
};

// Defaults — match the values in apps/web/config/paths.config.ts.
const DEFAULT_SIGN_IN_PATH = '/auth/sign-in';
const DEFAULT_MFA_VERIFY_PATH = '/auth/verify';

/**
 * @name requireUser
 * @description Require a session to be present in the request
 * @param client
 * @param options
 * @param options.verifyMfa
 * @param options.next
 * @param options.signInPath - Override the default sign-in redirect path.
 * @param options.mfaVerifyPath - Override the default MFA verification redirect path.
 */
export async function requireUser(
  client: SupabaseClient,
  options?: {
    verifyMfa?: boolean;
    next?: string;
    /**
     * Explicit JWT to verify, used by bearer-token callers (mobile / native).
     */
    token?: string;
    signInPath?: string;
    mfaVerifyPath?: string;
  },
): Promise<SuccessResult | (AuthenticationErrorResult | MultiAuthErrorResult)> {
  const { data, error } = await client.auth.getClaims(options?.token);

  const signInPath = options?.signInPath ?? DEFAULT_SIGN_IN_PATH;
  const mfaVerifyPath = options?.mfaVerifyPath ?? DEFAULT_MFA_VERIFY_PATH;

  if (!data?.claims || error) {
    return {
      data: null,
      error: new AuthenticationError(),
      redirectTo: getRedirectTo(signInPath, options?.next),
    };
  }

  const { verifyMfa = true } = options ?? {};

  if (verifyMfa) {
    const requiresMfa = options?.token
      ? await checkTokenRequiresMultiFactorAuthentication(client, options.token)
      : await checkRequiresMultiFactorAuthentication(client);

    // If the user requires multi-factor authentication,
    // redirect them to the page where they can verify their identity.
    if (requiresMfa) {
      return {
        data: null,
        error: new MultiFactorAuthError(),
        redirectTo: getRedirectTo(mfaVerifyPath, options?.next),
      };
    }
  }

  const role = data.claims.app_metadata?.role;

  return {
    error: null,
    data: {
      is_anonymous: data.claims.is_anonymous || false,
      aal: data.claims.aal,
      email: data.claims.email,
      phone: data.claims.phone,
      is_superadmin: role === 'super-admin' && data.claims.aal === 'aal2',
      has_cms_access: data.claims.app_metadata?.cms_access === 'true',
      id: data.claims.sub,
      amr: data.claims.amr,
    },
  };
}

class AuthenticationError extends Error {
  constructor() {
    super(`Authentication required`);
  }
}

export class MultiFactorAuthError extends Error {
  constructor() {
    super(`Multi-factor authentication required`);
  }
}

function getRedirectTo(path: string, next?: string) {
  return path + (next ? `?next=${next}` : '');
}
