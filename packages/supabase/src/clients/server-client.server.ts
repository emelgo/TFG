import { createServerClient, parseCookieHeader } from '@supabase/ssr';

import { getRequest, setCookie } from '@tanstack/react-start/server';

import { type Database } from '../database.types';
import { getSupabaseClientKeys } from '../get-supabase-client-keys';

/**
 * @name getSupabaseServerClient
 * @description Creates a Supabase client for use on the server. Reads cookies
 * from the incoming request and persists refreshed session cookies on the
 * response — collapsing the old server-client + middleware-client split.
 */
export function getSupabaseServerClient<GenericSchema = Database>() {
  const keys = getSupabaseClientKeys();

  return createServerClient<GenericSchema>(keys.url, keys.publicKey, {
    cookieOptions: {
      // Mark session cookies as Secure in production (HTTPS). Gated to
      // production so local dev over http://localhost keeps working.
      secure: process.env.NODE_ENV === 'production',
    },
    cookies: {
      getAll() {
        const header = getRequest().headers.get('cookie') ?? '';

        return parseCookieHeader(header).map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          setCookie(name, value, options),
        );
      },
    },
  });
}
