import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { authFunctionMiddleware } from '@pymekit/function-middleware/functions';
import { getLogger } from '@pymekit/shared/logger';
import { getSafeRedirectPath } from '@pymekit/shared/utils';
import { type Database } from '@pymekit/supabase/database';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';
import { type JWTUserData } from '@pymekit/supabase/types';

import { AcceptInvitationSchema } from '../../schema/accept-invitation.schema';
import { DeleteInvitationSchema } from '../../schema/delete-invitation.schema';
import { InviteMembersSchema } from '../../schema/invite-members.schema';
import { RenewInvitationSchema } from '../../schema/renew-invitation.schema';
import { ResendInvitationSchema } from '../../schema/resend-invitation.schema';
import { UpdateInvitationSchema } from '../../schema/update-invitation.schema';
import { createInvitationContextBuilder } from '../policies/invitation-context-builder';
import { createInvitationsPolicyEvaluator } from '../policies/invitation-policies';
import { createAccountInvitationsService } from '../services/account-invitations.service.server';
import { createAccountPerSeatBillingService } from '../services/account-per-seat-billing.service.server';

/**
 * @name createInvitationsFunction
 * @description Creates invitations for inviting members.
 */
export const createInvitationsFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(
    InviteMembersSchema.and(
      z.object({
        accountSlug: z.string().min(1),
      }),
    ),
  )
  .handler(async ({ data: params, context: { user } }) => {
    const logger = await getLogger();

    logger.info(
      { params, userId: user.id },
      'User requested to send invitations',
    );

    const client = getSupabaseServerClient();

    // Get account ID from slug (needed for permission checks and policies)
    const { data: account, error: accountError } = await client
      .from('accounts')
      .select('id')
      .eq('slug', params.accountSlug)
      .single();

    if (accountError || !account) {
      logger.error(
        { accountSlug: params.accountSlug, error: accountError },
        'Account not found',
      );

      return {
        success: false,
        reasons: ['Account not found'],
      };
    }

    // Check invitation permissions (replaces RLS policy checks)
    const permissionsResult = await checkInvitationPermissions(
      account.id,
      user.id,
      params.invitations,
    );

    if (!permissionsResult.allowed) {
      logger.info(
        { reason: permissionsResult.reason, userId: user.id },
        'Invitations blocked by permission check',
      );

      return {
        success: false,
        reasons: permissionsResult.reason ? [permissionsResult.reason] : [],
      };
    }

    // Evaluate custom invitation policies
    const policiesResult = await evaluateInvitationsPolicies(
      params,
      user,
      account.id,
    );

    // If the invitations are not allowed, throw an error
    if (!policiesResult.allowed) {
      logger.info(
        { reasons: policiesResult?.reasons, userId: user.id },
        'Invitations blocked by policies',
      );

      return {
        success: false,
        reasons: policiesResult?.reasons,
      };
    }

    // invitations are allowed, so continue with the server function
    // Use admin client since we've already validated permissions
    const adminClient = getSupabaseServerAdminClient();
    const service = createAccountInvitationsService(adminClient);

    try {
      await service.sendInvitations({
        ...params,
        invitedBy: user.id,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error(
        { accountId: account.id, userId: user.id, error },
        'Failed to send invitations',
      );

      return {
        success: false,
        reasons: getSendInvitationsFailureReasons(error),
      };
    }
  });

/**
 * @name getSendInvitationsFailureReasons
 * @description Surfaces the account-quota / rate-limit messages raised by the
 * `add_invitations_to_account` Postgres function so the user gets actionable
 * feedback, while keeping any other failure generic.
 */
function getSendInvitationsFailureReasons(error: unknown) {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);

  const knownReasons = [
    'maximum number of pending invitations',
    'Invitation rate limit reached',
  ];

  const matched = knownReasons.find((reason) => message.includes(reason));

  return matched ? [message] : [];
}

/**
 * @name deleteInvitationFunction
 * @description Deletes an invitation specified by the invitation ID.
 */
export const deleteInvitationFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(DeleteInvitationSchema)
  .handler(async ({ data }) => {
    const client = getSupabaseServerClient();
    const service = createAccountInvitationsService(client);

    // Delete the invitation
    await service.deleteInvitation(data);

    return {
      success: true,
    };
  });

/**
 * @name updateInvitationFunction
 * @description Updates an invitation.
 */
export const updateInvitationFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(UpdateInvitationSchema)
  .handler(async ({ data: invitation }) => {
    const client = getSupabaseServerClient();
    const service = createAccountInvitationsService(client);

    await service.updateInvitation(invitation);

    return {
      success: true,
    };
  });

/**
 * @name acceptInvitationFunction
 * @description Accepts an invitation to join a team.
 */
export const acceptInvitationFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(AcceptInvitationSchema)
  .handler(async ({ data, context: { user } }) => {
    const client = getSupabaseServerClient();

    const { inviteToken, nextPath } = data;
    const safeNextPath = getSafeRedirectPath(nextPath, '/dashboard');

    // create the services
    const perSeatBillingService = createAccountPerSeatBillingService(client);
    const service = createAccountInvitationsService(client);

    // use admin client to accept invitation
    const adminClient = getSupabaseServerAdminClient();

    if (!user.email) {
      throw new Error('User has not set up a valid email');
    }

    // Accept the invitation
    const accountId = await service.acceptInvitationToTeam(adminClient, {
      inviteToken,
      userId: user.id,
      userEmail: user.email,
    });

    // If the account ID is not present, throw an error
    if (!accountId) {
      throw new Error('Failed to accept invitation');
    }

    // Increase the seats for the account (no-op until @pymekit/billing ports —
    // see account-per-seat-billing.service.ts)
    await perSeatBillingService.increaseSeats(accountId);

    // Open the joined team as the active account. Non-fatal: the membership is
    // already persisted, so a failure here only affects which workspace loads.
    const { error: activationError } = await client.rpc('set_active_account', {
      target_account_id: accountId,
    });

    if (activationError) {
      const logger = await getLogger();

      logger.error(
        {
          name: 'team-accounts.accept-invitation',
          accountId,
          error: activationError,
        },
        `Invitation accepted but activating the team as the active account failed`,
      );
    }

    throw redirect({ href: safeNextPath });
  });

/**
 * @name renewInvitationFunction
 * @description Renews an invitation.
 */
export const renewInvitationFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(RenewInvitationSchema)
  .handler(async ({ data: { invitationId } }) => {
    const client = getSupabaseServerClient();

    const service = createAccountInvitationsService(client);

    // Renew the invitation
    await service.renewInvitation(invitationId);

    return {
      success: true,
    };
  });

/**
 * @name resendInvitationFunction
 * @description Resends an invitation email when the resend rate limit allows it.
 */
export const resendInvitationFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(ResendInvitationSchema)
  .handler(async ({ data: { invitationId }, context: { user } }) => {
    const logger = await getLogger();
    const adminClient = getSupabaseServerAdminClient();

    const { data: invitation, error } = await adminClient
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .single();

    if (error || !invitation) {
      logger.error(
        { error, invitationId, userId: user.id },
        'Invitation not found for resend',
      );

      throw new Error('Invitation not found');
    }

    const permissionsResult = await checkInvitationPermissions(
      invitation.account_id,
      user.id,
      [
        {
          email: invitation.email,
          role: invitation.role,
        },
      ],
    );

    if (!permissionsResult.allowed) {
      logger.info(
        {
          invitationId,
          reason: permissionsResult.reason,
          userId: user.id,
        },
        'Invitation resend blocked by permission check',
      );

      throw new Error(
        permissionsResult.reason ?? 'You do not have permission to resend',
      );
    }

    const service = createAccountInvitationsService(adminClient);

    await service.resendInvitation(invitation);

    return {
      success: true,
    };
  });

/**
 * @name evaluateInvitationsPolicies
 * @description Evaluates invitation policies with performance optimization.
 * @param params - The invitations to evaluate (emails and roles).
 * @param user - The user performing the invitation.
 * @param accountId - The account ID (already fetched to avoid duplicate queries).
 */
async function evaluateInvitationsPolicies(
  params: z.output<typeof InviteMembersSchema> & { accountSlug: string },
  user: JWTUserData,
  accountId: string,
) {
  const evaluator = createInvitationsPolicyEvaluator();
  const hasPolicies = await evaluator.hasPoliciesForStage('submission');

  // No policies to evaluate, skip
  if (!hasPolicies) {
    return {
      allowed: true,
      reasons: [],
    };
  }

  const client = getSupabaseServerClient();
  const builder = createInvitationContextBuilder(client);
  const context = await builder.buildContextWithAccountId(
    params,
    user,
    accountId,
  );

  return evaluator.canInvite(context, 'submission');
}

/**
 * @name checkInvitationPermissions
 * @description Checks if the user has permission to invite members and
 * validates role hierarchy for each invitation.
 * Optimized to batch all checks in parallel.
 */
async function checkInvitationPermissions(
  accountId: string,
  userId: string,
  invitations: z.output<typeof InviteMembersSchema>['invitations'],
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const client = getSupabaseServerClient();
  const logger = await getLogger();

  const ctx = {
    name: 'checkInvitationPermissions',
    userId,
    accountId,
  };

  // Get unique roles from invitations to minimize RPC calls
  const uniqueRoles = [...new Set(invitations.map((inv) => inv.role))];

  // Run all checks in parallel: permission check + role hierarchy checks for each unique role
  const [permissionResult, ...roleResults] = await Promise.all([
    client.rpc('has_permission', {
      user_id: userId,
      account_id: accountId,
      permission_name:
        'invites.manage' as Database['public']['Enums']['app_permissions'],
    }),
    ...uniqueRoles.map((role) =>
      Promise.all([
        client.rpc('has_more_elevated_role', {
          target_user_id: userId,
          target_account_id: accountId,
          role_name: role,
        }),
        client.rpc('has_same_role_hierarchy_level', {
          target_user_id: userId,
          target_account_id: accountId,
          role_name: role,
        }),
      ]).then(([elevated, sameLevel]) => ({
        role,
        allowed: elevated.data || sameLevel.data,
      })),
    ),
  ]);

  // Check permission first
  if (!permissionResult.data) {
    logger.info(ctx, 'User does not have invites.manage permission');

    return {
      allowed: false,
      reason: 'You do not have permission to invite members',
    };
  }

  // Check role hierarchy results
  const failedRole = roleResults.find((result) => !result.allowed);

  if (failedRole) {
    logger.info(
      { ...ctx, role: failedRole.role },
      'User cannot invite to a role higher than their own',
    );

    return {
      allowed: false,
      reason: `You cannot invite members with the "${failedRole.role}" role`,
    };
  }

  return { allowed: true };
}
