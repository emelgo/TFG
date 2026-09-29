import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { authFunctionMiddleware } from '@pymekit/function-middleware/functions';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';

import { LeaveTeamAccountSchema } from '../../schema/leave-team-account.schema';
import { createLeaveTeamAccountService } from '../services/leave-team-account.service.server';

export const leaveTeamAccountFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(LeaveTeamAccountSchema)
  .handler(async ({ data: params, context: { user } }) => {
    // The admin client is safe here because `userId` is bound to the
    // authenticated `context.user.id` — a user can only remove their own
    // membership.
    const service = createLeaveTeamAccountService(
      getSupabaseServerAdminClient(),
    );

    await service.leaveTeamAccount({
      accountId: params.accountId,
      userId: user.id,
    });

    throw redirect({ to: '/dashboard' });
  });
