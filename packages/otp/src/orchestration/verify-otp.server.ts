import type { SupabaseClient } from '@supabase/supabase-js';

import type { Logger } from '@pymekit/shared/logger';
import type { Database } from '@pymekit/supabase/database';

import { createOtpApi } from '../api';

/**
 * @name verifyOtpForPurpose
 * @description
 * Verifies an OTP for a sensitive operation. Throws on invalid token or
 * user-id mismatch.
 *
 * Callable from any server-only context (server functions, route handlers,
 * RSCs, middleware).
 */
export async function verifyOtpForPurpose(params: {
  client: SupabaseClient<Database>;
  logger: Logger;
  ctx: Record<string, unknown>;
  userId: string;
  token: string;
  purpose: string;
  logInvalid?: boolean;
  logMismatch?: boolean;
  maxVerificationAttempts?: number;
}) {
  const otpApi = createOtpApi(params.client);

  const result = await otpApi.verifyToken({
    token: params.token,
    userId: params.userId,
    purpose: params.purpose,
    maxVerificationAttempts: params.maxVerificationAttempts,
  });

  if (!result.valid) {
    if (params.logInvalid) {
      params.logger.error(params.ctx, 'Invalid OTP provided');
    }

    throw new Error('Invalid OTP');
  }

  if (result.user_id !== params.userId) {
    if (params.logMismatch) {
      params.logger.error(
        params.ctx,
        'This token was meant to be used by a different user. Exiting.',
      );
    }

    throw new Error('Nonce mismatch');
  }
}
