import { createServerFn } from '@tanstack/react-start';

import { checkRequiresMultiFactorAuthentication } from '@pymekit/supabase/check-requires-mfa';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

/**
 * Resolves the current user for the MFA challenge screen.
 *
 * Supabase gives a user with MFA enrolled an `aal1` session immediately after
 * password sign-in, so a session already exists here — we gate on the assurance
 * level instead. Returns `{ userId: null }` when there is no session or MFA is
 * not required; the route loader turns that into a redirect back to sign-in.
 */
export const fetchMfaChallenge = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ userId: string | null }> => {
    const client = getSupabaseServerClient();
    const { data } = await client.auth.getClaims();

    if (!data?.claims) {
      return { userId: null };
    }

    const needsMfa = await checkRequiresMultiFactorAuthentication(client);

    if (!needsMfa) {
      return { userId: null };
    }

    return { userId: data.claims.sub };
  },
);

/**
 * Boolean MFA gate for the authenticated route guard.
 *
 * Returns `true` when the current session is authenticated but sits at a lower
 * assurance level than the user's enrolled factors require (i.e. an `aal1`
 * session that must step up to `aal2`). Returns `false` when there is no session
 * — the route's auth gate handles the sign-in redirect in that case.
 */
export const fetchRequiresMfa = createServerFn({ method: 'GET' }).handler(
  async (): Promise<boolean> => {
    const client = getSupabaseServerClient();
    const { data } = await client.auth.getClaims();

    if (!data?.claims) {
      return false;
    }

    return checkRequiresMultiFactorAuthentication(client);
  },
);
