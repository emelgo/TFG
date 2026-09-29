import { createServerClient } from '@supabase/ssr';

import { type Database } from '../database.types';
import { getSupabaseClientKeys } from '../get-supabase-client-keys';

/**
 * @name getSupabaseBearerClient
 * @description Creates a Supabase server-side client authenticated via a bearer JWT
 * (no cookies). Used by `enhanceRouteHandler` when an `Authorization: Bearer` header
 * is present — i.e. mobile / native API consumers that hold their session in
 * SecureStore rather than cookies.
 *
 * The JWT is attached as a global request header so every PostgREST call carries
 * the user's identity; RLS continues to enforce access exactly as it does for
 * cookie-based callers.
 */
export function getSupabaseBearerClient<GenericSchema = Database>(
  token: string,
) {
  const keys = getSupabaseClientKeys();

  return createServerClient<GenericSchema>(keys.url, keys.publicKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
