import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';
import { usePasskeysQueryKey } from './use-user-passkeys-query-key';

/**
 * Mutación que elimina una *passkey* del usuario con sesión iniciada.
 *
 * @see https://supabase.com/docs/guides/auth/passkeys
 */
export function useDeletePasskey(userId: string) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const queryKey = usePasskeysQueryKey(userId);

  const mutationFn = async (passkeyId: string) => {
    const { error } = await client.auth.passkey.delete({ passkeyId });

    if (error) {
      throw error;
    }
  };

  return useMutation({
    mutationKey: queryKey,
    mutationFn,
    onSuccess: () => {
      return queryClient.refetchQueries({ queryKey });
    },
  });
}

export default useDeletePasskey;
