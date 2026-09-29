import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@pymekit/supabase/database';

import { createTeamAccountsApi } from '../api';

/**
 * @name assertPermission
 * @description
 * Checks whether a user has a specific app permission for an account by
 * delegating to the `has_permission` RPC (via `createTeamAccountsApi`).
 * Returns a boolean — callers throw / log on their own terms.
 *
 * Returns `false` if the RPC errors or if the user lacks the permission.
 * Callers that need to distinguish RPC failure from a clean "denied" answer
 * should call the API directly.
 *
 * Callable from any server-only context (server functions, route handlers,
 * RSCs, middleware).
 */
export async function assertPermission(params: {
  client: SupabaseClient<Database>;
  accountId: string;
  userId: string;
  permission: Database['public']['Enums']['app_permissions'];
}) {
  try {
    const api = createTeamAccountsApi(params.client);

    return api.hasPermission({
      accountId: params.accountId,
      userId: params.userId,
      permission: params.permission,
    });
  } catch {
    return false;
  }
}
