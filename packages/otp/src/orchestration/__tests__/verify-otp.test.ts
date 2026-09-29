import type { SupabaseClient } from '@supabase/supabase-js';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@pymekit/shared/logger';

import { verifyOtpForPurpose } from '../verify-otp.server';

const verifyToken = vi.fn();

vi.mock('../../api', () => ({
  createOtpApi: () => ({ verifyToken }),
}));

function createLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
}

const baseParams = () => ({
  client: {} as unknown as SupabaseClient,
  logger: createLogger() as unknown as Logger,
  ctx: { name: 'test' },
  userId: 'user-1',
  token: '123456',
  purpose: 'delete-personal-account',
});

describe('verifyOtpForPurpose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves when the token is valid and the user matches', async () => {
    verifyToken.mockResolvedValue({ valid: true, user_id: 'user-1' });

    const params = baseParams();

    await expect(verifyOtpForPurpose(params)).resolves.toBeUndefined();
    expect(params.logger.error).not.toHaveBeenCalled();
  });

  it('forwards token, userId, purpose and attempt cap to the api', async () => {
    verifyToken.mockResolvedValue({ valid: true, user_id: 'user-1' });

    await verifyOtpForPurpose({ ...baseParams(), maxVerificationAttempts: 5 });

    expect(verifyToken).toHaveBeenCalledWith({
      token: '123456',
      userId: 'user-1',
      purpose: 'delete-personal-account',
      maxVerificationAttempts: 5,
    });
  });

  it('throws on an invalid token', async () => {
    verifyToken.mockResolvedValue({ valid: false, user_id: null });

    await expect(verifyOtpForPurpose(baseParams())).rejects.toThrow(
      'Invalid OTP',
    );
  });

  it('logs an invalid token only when logInvalid is set', async () => {
    verifyToken.mockResolvedValue({ valid: false, user_id: null });

    const silent = baseParams();
    await expect(verifyOtpForPurpose(silent)).rejects.toThrow();
    expect(silent.logger.error).not.toHaveBeenCalled();

    const loud = baseParams();
    await expect(
      verifyOtpForPurpose({ ...loud, logInvalid: true }),
    ).rejects.toThrow();
    expect(loud.logger.error).toHaveBeenCalledWith(
      loud.ctx,
      'Invalid OTP provided',
    );
  });

  it('throws on a user-id mismatch even when the token is valid', async () => {
    verifyToken.mockResolvedValue({ valid: true, user_id: 'someone-else' });

    await expect(verifyOtpForPurpose(baseParams())).rejects.toThrow(
      'Nonce mismatch',
    );
  });

  it('logs a mismatch only when logMismatch is set', async () => {
    verifyToken.mockResolvedValue({ valid: true, user_id: 'someone-else' });

    const silent = baseParams();
    await expect(verifyOtpForPurpose(silent)).rejects.toThrow('Nonce mismatch');
    expect(silent.logger.error).not.toHaveBeenCalled();

    const loud = baseParams();
    await expect(
      verifyOtpForPurpose({ ...loud, logMismatch: true }),
    ).rejects.toThrow('Nonce mismatch');
    expect(loud.logger.error).toHaveBeenCalled();
  });
});
