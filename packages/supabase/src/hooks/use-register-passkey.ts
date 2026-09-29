import type { RegisterPasskeyCredentials } from '@supabase/supabase-js';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';
import { usePasskeysQueryKey } from './use-user-passkeys-query-key';

/**
 * @name useRegisterPasskey
 * @description
 * Register a new passkey (WebAuthn credential) for the currently
 * authenticated user. Handles the full browser credential ceremony.
 *
 * Requires an active session and the `experimental.passkey` flag enabled
 * on the Supabase client.
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
