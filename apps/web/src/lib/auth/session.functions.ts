import { createServerFn } from '@tanstack/react-start';

import { getSupabaseServerClient } from '@pymekit/supabase/server-client';
import type { JWTUserData } from '@pymekit/supabase/types';

export type Session = JWTUserData | null;

/**
 * Reads identity from the JWT via `getClaims()` (NOT `getUser()`). This runs in
 * the root `beforeLoad`; the cookie-writing server client persists the rotated
 * refresh token via `setAll` on every hard navigation — the single token-refresh
 * point that replaces the old `proxy.ts` middleware client.
 *
 * Returns `null` (never throws) when there is no session, so the app boots
 * cleanly for logged-out visitors. The mapping mirrors `requireUser` so guards
 * can share the `JWTUserData` shape.
 */
export const fetchSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Session> => {
    const client = getSupabaseServerClient();
    const { data, error } = await client.auth.getClaims();

    if (error || !data?.claims) {
      return null;
    }

    const claims = data.claims;
    const role = claims.app_metadata?.role;

    return {
      id: claims.sub,
      email: claims.email,
      phone: claims.phone,
      aal: claims.aal,
      amr: claims.amr,
      is_superadmin: role === 'super-admin' && claims.aal === 'aal2',
      // Acceso al CMS (ADR-014): solo el *claim*. No se exige aal2 aquí para
      // que la consola pueda mostrar al personal sin MFA verificado el aviso
      // de verificación en dos pasos en lugar de un 404.
      has_cms_access: claims.app_metadata?.cms_access === 'true',
      is_anonymous: claims.is_anonymous ?? false,
    };
  },
);
