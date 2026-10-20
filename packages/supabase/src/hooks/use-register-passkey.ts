import type { RegisterPasskeyCredentials } from '@supabase/supabase-js';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';
import { usePasskeysQueryKey } from './use-user-passkeys-query-key';

/**
 * Mutación que registra una nueva *passkey* (credencial WebAuthn) para el
 * usuario autenticado, incluida toda la ceremonia con el navegador.
 *
 * Necesita una sesión activa y la opción `experimental.passkey` del cliente
 * de Supabase.
 *
 * @see https://supabase.com/docs/guides/auth/passkeys
 */
export function useRegisterPasskey(userId: string) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const queryKey = usePasskeysQueryKey(userId);

  const mutationFn = async (credentials?: RegisterPasskeyCredentials) => {
    const result = await client.auth.registerPasskey(credentials);

    if (result.error) {
      throw result.error;
    }

    return result.data;
  };

  return useMutation({
    mutationKey: queryKey,
    mutationFn,
    onSuccess: () => {
      return queryClient.refetchQueries({ queryKey });
    },
  });
}

export default useRegisterPasskey;
