import type { SignInWithPasskeyCredentials } from '@supabase/supabase-js';

import { useMutation } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';

/**
 * Mutación de inicio de sesión con *passkey* (WebAuthn): hace la ceremonia
 * con el navegador y crea la sesión si tiene éxito.
 *
 * Necesita la opción `experimental.passkey` del cliente y WebAuthn activado
 * en el proyecto de Supabase.
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
