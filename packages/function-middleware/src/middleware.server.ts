import { isNotFound, isRedirect, redirect } from '@tanstack/react-router';
import { createMiddleware } from '@tanstack/react-start';
import * as z from 'zod';

import { type Database } from '@pymekit/supabase/database';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

export type AppPermission = Database['public']['Enums']['app_permissions'];

/**
 * Validated shape every account-scoped gate relies on. The action's own
 * `.validator` should declare the full input schema (extending this); this is
 * the middleware-side guarantee that a uuid `accountId` is present.
 */
const AccountIdSchema = z.object({ accountId: z.uuid() });

/**
 * Pulls a validated uuid `accountId` out of the action input.
 */
function extractAccountId(data: unknown): string {
  return AccountIdSchema.parse(data).accountId;
}

/**
 * Error-normalization boundary. Replicates next-safe-action's
 * `handleServerError: (e) => e.message` — only the message string is thrown
 * onward to the client. Router control-flow signals (redirect/notFound) pass
 * through untouched so navigation still works.
 */
export const errorMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (isRedirect(error) || isNotFound(error)) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Internal Server Error';

      // Re-throw a clean Error so stacks/internals are not serialized.
      throw new Error(message);
    }
  },
);

/**
 * Authenticated middleware — injects `context.user` (JWTUserData).
 * Redirects to the sign-in path when anonymous (mirrors authActionClient).
 */
export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const client = getSupabaseServerClient();
    const auth = await requireUser(client);

    if (!auth.data) {
      throw redirect({ to: auth.redirectTo });
    }

    return next({ context: { user: auth.data } });
  },
);

/**
 * Admin middleware — requires `context.user.is_superadmin` (derived from JWT
 * claims: role === 'super-admin' && aal === 'aal2'). Does NOT depend on the
 * unported @pymekit/admin package.
 */
export const adminMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    if (!context.user.is_superadmin) {
      throw new Error('Forbidden');
    }

    return next({ context });
  });

/**
 * Team-account middleware — validates a uuid `accountId` in the action input
 * and asserts membership via the `has_role_on_account` RPC (RLS client
 * authorizes as the current user). Injects `context.accountId`.
 *
 * The action MUST declare `.validator` with an `{ accountId: string }` shape
 * before this middleware reads it. `data` is the validated input.
 */
export const teamAccountMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, data }) => {
    const accountId = extractAccountId(data);
    const client = getSupabaseServerClient();

    const { data: hasRole, error } = await client.rpc('has_role_on_account', {
      account_id: accountId,
    });

    if (error) {
      throw new Error('Membership check failed');
    }

    if (!hasRole) {
      throw new Error('Unauthorized');
    }

    return next({ context: { accountId } });
  });

/**
 * Gate: require a role at OR ABOVE the given role's hierarchy level on the
 * account. `has_role_on_account` does an EXACT role match, so it cannot express
 * "minimum role" — an owner would fail `withMinRole('member')`. Instead combine
 * the hierarchy RPCs: `has_more_elevated_role` (strictly above) OR
 * `has_same_role_hierarchy_level` (equal). Mirrors the drizzle sibling's
 * `getRoleHierarchy` comparison.
 */
export function withMinRole(role: string) {
  return createMiddleware({ type: 'function' })
    .middleware([authMiddleware])
    .server(async ({ next, data, context }) => {
      const accountId = extractAccountId(data);
      const client = getSupabaseServerClient();

      const [moreElevated, sameLevel] = await Promise.all([
        client.rpc('has_more_elevated_role', {
          target_user_id: context.user.id,
          target_account_id: accountId,
          role_name: role,
        }),
        client.rpc('has_same_role_hierarchy_level', {
          target_user_id: context.user.id,
          target_account_id: accountId,
          role_name: role,
        }),
      ]);

      const allowed = moreElevated.data || sameLevel.data;

      if (moreElevated.error || sameLevel.error || !allowed) {
        throw new Error(`Unauthorized: ${role} role or higher required`);
      }

      return next({ context: { accountId } });
    });
}

/**
 * Gate: require a feature permission on the account via `has_permission`.
 * Needs the current user id (from context.user.id) + account_id from input.
 */
export function withFeaturePermission(permission: AppPermission) {
  return createMiddleware({ type: 'function' })
    .middleware([authMiddleware])
    .server(async ({ next, data, context }) => {
      const accountId = extractAccountId(data);
      const client = getSupabaseServerClient();

      const { data: allowed, error } = await client.rpc('has_permission', {
        account_id: accountId,
        user_id: context.user.id,
        permission_name: permission,
      });

      if (error || !allowed) {
        throw new Error('Unauthorized');
      }

      return next({ context: { accountId } });
    });
}

/**
 * TODO(migration): withCaptcha — verifyCaptchaToken lives in the unported
 * @pymekit/auth (`@pymekit/auth/captcha/server`). Once ported, add:
 *
 *   export const captchaMiddleware = createMiddleware({ type: 'function' })
 *     .server(async ({ next, data }) => {
 *       await verifyCaptchaToken(
 *         (data as { captchaToken?: string })?.captchaToken ?? '',
 *       );
 *       return next();
 *     });
 *
 * and a `withCaptcha` gate. Do NOT implement until @pymekit/auth is available.
 */
