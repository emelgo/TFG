import { useCallback } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { Json } from '@pymekit/supabase/database';
import { useSupabase } from '@pymekit/supabase/hooks/use-supabase';

import { accountKeys, fetchPersonalAccount } from '../shared';

export function usePersonalAccountData(
  userId: string,
  partialAccount?: {
    id: string | null;
    name: string | null;
    picture_url: string | null;
    public_data?: Json;
  },
) {
  const client = useSupabase();

  return useQuery({
    queryKey: accountKeys.data(userId),
    queryFn: () => fetchPersonalAccount(client, userId),
    enabled: !!userId,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    initialData: partialAccount?.id
      ? {
          id: partialAccount.id,
          name: partialAccount.name,
          picture_url: partialAccount.picture_url,
          public_data: partialAccount.public_data,
        }
      : undefined,
  });
}

export function useRevalidatePersonalAccountDataQuery() {
  const queryClient = useQueryClient();

  return useCallback(
    (userId: string) =>
      queryClient.invalidateQueries({
        queryKey: accountKeys.data(userId),
      }),
    [queryClient],
  );
}
