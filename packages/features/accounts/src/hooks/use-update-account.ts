import { useMutation } from '@tanstack/react-query';

import type { Database } from '@pymekit/supabase/database';
import { useSupabase } from '@pymekit/supabase/hooks/use-supabase';

import { accountKeys } from '../shared';

type UpdateData = Database['public']['Tables']['accounts']['Update'];

export function useUpdateAccountData(accountId: string) {
  const client = useSupabase();

  const mutationKey = accountKeys.data(accountId);

  const mutationFn = async (data: UpdateData) => {
    const response = await client.from('accounts').update(data).match({
      id: accountId,
    });

    if (response.error) {
      throw response.error;
    }

    return response.data;
  };

  return useMutation({
    mutationKey,
    mutationFn,
  });
}
