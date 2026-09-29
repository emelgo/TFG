import type { SignInWithPasskeyCredentials } from '@supabase/supabase-js';

import { useMutation } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';

/**
 * @name useSignInWithPasskey
 * @description
 * Sign in an existing user with a passkey (WebAuthn). Handles the full
 * browser credential ceremony and creates a session on success.
 *
 * Requires the `experimental.passkey` flag to be enabled on the Supabase
 * client and WebAuthn to be enabled in the Supabase project.
 *
 * @see https://supabase.com/docs/guides/auth/passkeys
 */
export function useSignInWithPasskey() {
  const client = useSupabase();
  const mutationKey = ['auth', 'sign-in-with-passkey'];

  const mutationFn = async (credentials?: SignInWithPasskeyCredentials) => {
    const result = await client.auth.signInWithPasskey(credentials);

    if (result.error) {
      throw result.error;
    }

    return result.data;
  };

  return useMutation({
    mutationFn,
    mutationKey,
  });
}

export default useSignInWithPasskey;
