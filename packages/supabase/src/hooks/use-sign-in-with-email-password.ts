import type { SignInWithPasswordCredentials } from '@supabase/supabase-js';

import { useMutation } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';

/** Mutación de inicio de sesión con email y contraseña. */
export function useSignInWithEmailPassword() {
  const client = useSupabase();
  const mutationKey = ['auth', 'sign-in-with-email-password'];

  const mutationFn = async (credentials: SignInWithPasswordCredentials) => {
    const response = await client.auth.signInWithPassword(credentials);

    if (response.error) {
      throw response.error;
    }

    const user = response.data?.user;
    const identities = user?.identities ?? [];

    // Un usuario sin identidades indica una cuenta incompleta o un email ya
    // usado por otra identidad; se trata como error.
    if (identities.length === 0) {
      throw new Error('User already registered');
    }

    return response.data;
  };

  return useMutation({ mutationKey, mutationFn });
}
