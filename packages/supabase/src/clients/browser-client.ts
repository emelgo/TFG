import { createBrowserClient } from '@supabase/ssr';

import { type Database } from '../database.types';
import { getSupabaseClientKeys } from '../get-supabase-client-keys';

/**
 * @name getSupabaseBrowserClient
 * @description Get a Supabase client for use in the Browser
 */
export function getSupabaseBrowserClient<GenericSchema = Database>() {
  const keys = getSupabaseClientKeys();

  return createBrowserClient<GenericSchema>(keys.url, keys.publicKey, {
    cookieOptions: {
      // Mark session cookies as Secure in production (HTTPS). Gated to
      // production so local dev over http://localhost keeps working. Kept in
      // sync with the server/middleware clients to avoid attribute drift.
      secure: process.env.NODE_ENV === 'production',
    },
    auth: {
      experimental: {
        // Opt-in to the WebAuthn/passkey APIs (`signInWithPasskey`,
        // `registerPasskey`, `passkey.*`). These methods throw at call time
        // unless this flag is enabled. The passkey UI is still gated behind
        // the `NEXT_PUBLIC_AUTH_PASSKEY` config flag.
        passkey: true,
      },
    },
  });
}
