import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { authFunctionMiddleware } from '@pymekit/function-middleware/functions';
import { verifyOtpForPurpose } from '@pymekit/otp/orchestration';
import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import { DeleteTeamAccountSchema } from '../../schema/delete-team-account.schema';
import { assertAccountOwner } from '../orchestration';
import { createDeleteTeamAccountService } from '../services/delete-team-account.service.server';

const enableTeamAccountDeletion =
  import.meta.env.VITE_ENABLE_TEAM_ACCOUNTS_DELETION === 'true';

export const deleteTeamAccountFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(DeleteTeamAccountSchema)
  .handler(async ({ data: params, context: { user } }) => {
    const logger = await getLogger();

    const client = getSupabaseServerClient();

    const ctx = {
      name: 'team-accounts.delete',
      userId: user.id,
      accountId: params.accountId,
    };

    if (!enableTeamAccountDeletion) {
      logger.warn(ctx, `Team account deletion is not enabled`);

      throw new Error('Team account deletion is not enabled');
    }

    await verifyOtpForPurpose({
      client,
      logger,
      ctx,
      userId: user.id,
      token: params.otp,
      purpose: `delete-team-account-${params.accountId}`,
      // allow a few honest retries while still bounding brute-force attempts
      maxVerificationAttempts: 5,
    });

    // owner check is the authoritative authorization gate here (stricter than
    // membership / role hierarchy)
    const isOwner = await assertAccountOwner({
      client,
      accountId: params.accountId,
    });

    if (!isOwner) {
      throw new Error('You do not have permission to delete this account');
    }

    const service = createDeleteTeamAccountService();

    logger.info(ctx, `Deleting team account...`);

    await service.deleteTeamAccount(client, {
      accountId: params.accountId,
      userId: user.id,
    });

    logger.info(ctx, `Team account request successfully sent`);

    throw redirect({ to: '/dashboard' });
  });
