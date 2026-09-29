import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@pymekit/supabase/database';

export type PersonalAccountData = Pick<
  Tables<'accounts'>,
  'id' | 'name' | 'picture_url' | 'public_data'
>;

export async function fetchPersonalAccount(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<PersonalAccountData | null> {
  if (!userId) {
    return null;
  }

  const response = await client
    .from('accounts')
    .select('id, name, picture_url, public_data')
    .eq('primary_owner_user_id', userId)
    .eq('is_personal_account', true)
    .single();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}
