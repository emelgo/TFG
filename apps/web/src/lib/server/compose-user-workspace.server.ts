import type { SupabaseClient } from '@supabase/supabase-js';

import { createAccountsApi } from '@pymekit/accounts/api';
import type { UserWorkspaceShape } from '@pymekit/accounts/shared';
import type { Database } from '@pymekit/supabase/database';
import type { JWTUserData } from '@pymekit/supabase/types';
import { createAccountCreationPolicyEvaluator } from '@pymekit/team-accounts/policies';

import featureFlagsConfig from '#/config/feature-flags.config.ts';

const shouldLoadAccounts = featureFlagsConfig.enableTeamAccounts;

/**
 * @name composeUserWorkspace
 * @description
 * Pure data-loader that composes the user workspace data from an authenticated
 * client + user.
 *
 * Returns null when the user has no accessible workspace (invalid/expired JWT
 * or deleted user); the caller decides how to surface the missing case.
 *
 * Callable from any server-only context (server functions, route loaders).
 */
export async function composeUserWorkspace(
  client: SupabaseClient<Database>,
  user: JWTUserData,
): Promise<UserWorkspaceShape | null> {
  const api = createAccountsApi(client);

  const accountsPromise = shouldLoadAccounts
    ? api.loadUserAccounts()
    : Promise.resolve([]);

  const workspacePromise = api.getAccountWorkspace();

  const [accounts, workspace] = await Promise.all([
    accountsPromise,
    workspacePromise,
  ]);

  if (!workspace) {
    return null;
  }

  const canCreateTeamAccount = shouldLoadAccounts
    ? await checkCanCreateTeamAccount(user.id)
    : { allowed: false, reason: undefined };

  return {
    accounts,
    workspace,
    user,
    canCreateTeamAccount,
  };
}

/**
 * Check if the user can create a team account based on policies.
 * Preliminary checks run without account name - name validation happens during
 * submission.
 */
async function checkCanCreateTeamAccount(userId: string) {
  const evaluator = createAccountCreationPolicyEvaluator();
  const hasPolicies = await evaluator.hasPoliciesForStage('preliminary');

  if (!hasPolicies) {
    return { allowed: true, reason: undefined };
  }

  const context = {
    timestamp: new Date().toISOString(),
    userId,
    accountName: '',
  };

  const result = await evaluator.canCreateAccount(context, 'preliminary');

  return {
    allowed: result.allowed,
    reason: result.reasons[0],
  };
}
