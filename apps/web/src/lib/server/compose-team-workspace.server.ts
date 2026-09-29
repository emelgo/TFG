import { type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@pymekit/supabase/database';
import type { JWTUserData } from '@pymekit/supabase/types';
import { createTeamAccountsApi } from '@pymekit/team-accounts/api';
import type { TeamAccountWorkspaceShape } from '@pymekit/team-accounts/shared';

/**
 * @name composeTeamWorkspace
 * @description
 * Pure data-loader that composes the team account workspace from an
 * authenticated client + user + slug.
 *
 * Returns null when the user has no accessible workspace for that slug
 * (RLS denied, slug unknown, mid-deletion race). Callers decide how to surface
 * the missing case — route loaders redirect home.
 *
 * Callable from any server-only context (server functions, route loaders).
 */
export async function composeTeamWorkspace(
  client: SupabaseClient<Database>,
  user: JWTUserData,
  accountSlug: string,
): Promise<TeamAccountWorkspaceShape | null> {
  const api = createTeamAccountsApi(client);
  const workspace = await api.getAccountWorkspace(accountSlug);

  if (!workspace.data?.account) {
    return null;
  }

  return {
    ...workspace.data,
    user,
  };
}
