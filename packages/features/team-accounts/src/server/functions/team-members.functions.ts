import { createServerFn } from '@tanstack/react-start';

import { authFunctionMiddleware } from '@pymekit/function-middleware/functions';
import {
  authMiddleware,
  errorMiddleware,
  withFeaturePermission,
} from '@pymekit/function-middleware/server';
import { verifyOtpForPurpose } from '@pymekit/otp/orchestration';
import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import { RemoveMemberSchema } from '../../schema/remove-member.schema';
import { TransferOwnershipConfirmationSchema } from '../../schema/transfer-ownership-confirmation.schema';
import { UpdateMemberRoleSchema } from '../../schema/update-member-role.schema';
import { assertAccountOwner } from '../orchestration';
import { createAccountMembersService } from '../services/account-members.service.server';

/**
 * @name removeMemberFromAccountFunction
 * @description Removes a member from an account.
 *
 * The `members.manage` feature-permission gate makes the authorization
 * explicit at the server-function layer (the RLS-backed service still enforces it too).
 * `accountId` is present in the validated input, which the gate requires.
 */
export const removeMemberFromAccountFunction = createServerFn({
  method: 'POST',
})
  .middleware([
    errorMiddleware,
    authMiddleware,
    withFeaturePermission('members.manage'),
  ])
  .validator(RemoveMemberSchema)
  .handler(async ({ data: { accountId, userId } }) => {
    const client = getSupabaseServerClient();
    const service = createAccountMembersService(client);

    await service.removeMemberFromAccount({
      accountId,
      userId,
    });

    return { success: true };
  });

/**
 * @name updateMemberRoleFunction
 * @description Updates the role of a member in an account.
 */
export const updateMemberRoleFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(UpdateMemberRoleSchema)
  .handler(async ({ data, context: { user } }) => {
    const client = getSupabaseServerClient();
    const service = createAccountMembersService(client);
    const adminClient = getSupabaseServerAdminClient();

    // update the role of the member. The acting user's id is passed so the
    // service can verify the actor is not assigning a role more elevated than
    // their own.
    await service.updateMemberRole(data, adminClient, user.id);

    return { success: true };
  });

/**
 * @name transferOwnershipFunction
 * @description Transfers the ownership of an account to another member.
 * Requires OTP verification for security.
 */
export const transferOwnershipFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(TransferOwnershipConfirmationSchema)
  .handler(async ({ data, context: { user } }) => {
    const client = getSupabaseServerClient();
    const logger = await getLogger();

    const ctx = {
      name: 'teams.transferOwnership',
      userId: user.id,
      accountId: data.accountId,
    };

    logger.info(ctx, 'Processing team ownership transfer request...');

    const isOwner = await assertAccountOwner({
      client,
      accountId: data.accountId,
    });

    if (!isOwner) {
      logger.error(ctx, 'User is not the owner of this account');

      throw new Error(
        `You must be the owner of the account to transfer ownership`,
      );
    }

    // Verify the OTP
    await verifyOtpForPurpose({
      client,
      logger,
      ctx,
      userId: user.id,
      token: data.otp,
      purpose: `transfer-team-ownership-${data.accountId}`,
      logInvalid: true,
      logMismatch: true,
      // allow a few honest retries while still bounding brute-force attempts
      maxVerificationAttempts: 5,
    });

    logger.info(
      ctx,
      'OTP verification successful. Proceeding with ownership transfer...',
    );

    const service = createAccountMembersService(client);

    // at this point, the user is authenticated, is the owner of the account, and has verified via OTP
    // so we proceed with the transfer of ownership with admin privileges
    const adminClient = getSupabaseServerAdminClient();

    // transfer the ownership of the account
    await service.transferOwnership(data, adminClient);

    logger.info(ctx, 'Team ownership transferred successfully');

    return {
      success: true,
    };
  });
