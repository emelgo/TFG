import { useQuery } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';
import { usePasskeysQueryKey } from './use-user-passkeys-query-key';

/**
 * @name useFetchPasskeys
 * @description
 * Fetch the passkeys registered for the currently signed-in user.
 *
 * @see https://supabase.com/docs/guides/auth/passkeys
 */
export function useFetchPasskeys(userId: string) {
  const client = useSupabase();
  const queryKey = usePasskeysQueryKey(userId);

  const queryFn = async () => {
    const { data, error } = await client.auth.passkey.list();

    if (error) {
      throw error;
    }

    return data;
  };

  return useQuery({
    queryKey,
    queryFn,
    staleTime: 0,
  });
}
