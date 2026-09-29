import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@pymekit/supabase/database';

/**
 * @name assertAccountOwner
 * @description
 * Checks whether the supplied account has the current user as its primary
 * owner by calling the `is_account_owner` RPC. Returns a boolean — callers
 * decide how to surface the failure (error message, log, thrown Error) so
 * this helper stays neutral and can be shared across actions with differing
 * observability needs.
 *
 * Returns `false` if the RPC errors or if the user is not the owner. Callers
 * that need to distinguish RPC failure from a clean "not owner" answer should
 * call the RPC directly.
 *
 * Callable from any server-only context (server functions, route handlers,
 * RSCs, middleware).
 */
export async function assertAccountOwner(params: {
  client: SupabaseClient<Database>;
  accountId: string;
}) {
  const { data: isAccountOwner, error } = await params.client
    .rpc('is_account_owner', { account_id: params.accountId })
    .single();

  if (error) {
    return false;
  }

  return isAccountOwner;
}
