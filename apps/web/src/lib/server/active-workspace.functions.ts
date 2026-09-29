import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { errorMiddleware } from '@pymekit/function-middleware/server';
import { canSwitchContext } from '@pymekit/shared/mode-utils';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import { accountModeConfig } from '#/config/account-mode.config.ts';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import type {
  WorkspaceAccountSummary,
  WorkspaceShape,
} from '#/lib/server/workspace-shape.ts';

export type { WorkspaceShape } from '#/lib/server/workspace-shape.ts';

const shouldLoadAccounts = featureFlagsConfig.enableTeamAccounts;

/**
 * Loads the workspace for the authenticated shell: the active account (resolved
 * from the DB, falling back to the personal account), the switchable teams, and
 * the current user.
 */
export const fetchWorkspace = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .handler(async (): Promise<WorkspaceShape> => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    const accountsPromise = shouldLoadAccounts
      ? client
          .from('user_accounts')
          .select('*')
          .order('name', { ascending: true })
      : Promise.resolve({
          data: [] as WorkspaceAccountSummary[],
          error: null,
        });

    const [workspaceResult, accountsResult] = await Promise.all([
      client.rpc('active_account_workspace'),
      accountsPromise,
    ]);

    if (workspaceResult.error) {
      throw workspaceResult.error;
    }

    // The resolver always returns the personal account as a fallback; an empty
    // result means the personal account row is gone (deleted user / stale JWT).
    let account = workspaceResult.data[0];

    if (!account) {
      throw redirect({ href: '/' });
    }

    if (accountsResult.error) {
      throw accountsResult.error;
    }

    // Teams-only mode: promote the first team to the active account so the
    // personal account is not the working surface. When the user has no team
    // the account stays personal; the `_authenticated` guard routes them to the
    // create-team flow (which must not itself be redirected — see route.tsx).
    if (
      featureFlagsConfig.enableTeamsOnly &&
      account.is_personal_account &&
      accountsResult.data[0]?.id
    ) {
      await client.rpc('set_active_account', {
        target_account_id: accountsResult.data[0].id,
      });

      const promoted = await client.rpc('active_account_workspace');

      if (promoted.error) {
        throw promoted.error;
      }

      account = promoted.data[0] ?? account;
    }

    // Personal-only mode: never let a stale team pointer be the working surface.
    // Demote back to the personal account, self-healing a mode switch after
    // launch or an out-of-band team membership (the team switcher is hidden, so
    // there is otherwise no way back). Passing the user id selects the personal
    // account (see `set_active_account`).
    if (
      accountModeConfig.mode === 'personal-only' &&
      !account.is_personal_account
    ) {
      await client.rpc('set_active_account', {
        target_account_id: auth.data.id,
      });

      const demoted = await client.rpc('active_account_workspace');

      if (demoted.error) {
        throw demoted.error;
      }

      account = demoted.data[0] ?? account;
    }

    return {
      account,
      accounts: accountsResult.data,
      user: auth.data,
    };
  });

/**
 * Switches the caller's active account (personal or a team they belong to).
 *
 * Delegates membership validation to the `set_active_account` function; the
 * client calls `router.invalidate()` afterwards to re-run every loader against
 * the new active account.
 */
export const setActiveAccountFunction = createServerFn({ method: 'POST' })
  .middleware([errorMiddleware])
  .validator(z.object({ accountId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    // The personal account shares the user's id; anything else is a team.
    const targetIsOrganization = data.accountId !== auth.data.id;

    const switchCheck = canSwitchContext(
      accountModeConfig.mode,
      targetIsOrganization,
    );

    if (!switchCheck.allowed) {
      throw new Error(
        switchCheck.reason ??
          'Context switching is not allowed in the current account mode',
      );
    }

    const { error } = await client.rpc('set_active_account', {
      target_account_id: data.accountId,
    });

    if (error) {
      throw error;
    }

    return { success: true } as const;
  });
