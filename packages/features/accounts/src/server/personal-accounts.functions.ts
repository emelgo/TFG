import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { authFunctionMiddleware } from '@pymekit/function-middleware/functions';
import { verifyOtpForPurpose } from '@pymekit/otp/orchestration';
import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import { DeletePersonalAccountSchema } from '../schema/delete-personal-account.schema';
import { createDeletePersonalAccountService } from './services/delete-personal-account.service.server';

const enableAccountDeletion =
  import.meta.env.VITE_ENABLE_PERSONAL_ACCOUNT_DELETION === 'true';

/**
 * Refreshes the current auth session. Called by the MFA setup dialog after a
 * factor is verified so the client picks up the elevated (aal2) session.
 */
export const refreshAuthSession = createServerFn({ method: 'POST' }).handler(
  async () => {
    const client = getSupabaseServerClient();

    await client.auth.refreshSession();

    return {};
  },
);

/**
 * Deletes the user's personal account after verifying a one-time password.
 *
 * On success the session is signed out and the server throws a TanStack
 * redirect to `/`; the browser follows it. The `errorMiddleware` in
 * `@pymekit/function-middleware` lets redirect signals pass through untouched.
 */
export const deletePersonalAccountFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(DeletePersonalAccountSchema)
  .handler(async ({ data, context: { user } }) => {
    const logger = await getLogger();

    const ctx = {
      name: 'account.delete',
      userId: user.id,
    };

    const otp = data.otp;

    if (!otp) {
      throw new Error('OTP is required');
    }

    if (!enableAccountDeletion) {
      logger.warn(ctx, `Account deletion is not enabled`);

      throw new Error('Account deletion is not enabled');
    }

    logger.info(ctx, `Deleting account...`);

    // verify the OTP
    const client = getSupabaseServerClient();

    await verifyOtpForPurpose({
      client,
      logger,
      ctx,
      userId: user.id,
      token: otp,
      purpose: 'delete-personal-account',
      logMismatch: true,
      // failed attempts are now counted (see verify_nonce); allow a few honest
      // retries while still bounding brute-force attempts
      maxVerificationAttempts: 5,
    });

    // create a new instance of the personal accounts service
    const service = createDeletePersonalAccountService();

    // delete the user's account and cancel all subscriptions
    await service.deletePersonalAccount({
      adminClient: getSupabaseServerAdminClient(),
      account: {
        id: user.id,
        email: user.email ?? null,
      },
    });

    // sign out the user after deleting their account
    await client.auth.signOut();

    logger.info(ctx, `Account request successfully sent`);

    // redirect to the home page (TanStack routers refetch on navigation, so no
    // cache invalidation is required here)
    throw redirect({ to: '/' });
  });
