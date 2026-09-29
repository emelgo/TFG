import type { SupabaseClient } from '@supabase/supabase-js';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MultiFactorAuthError, requireUser } from '../require-user';

type Claims = Record<string, unknown>;

interface FakeClientOptions {
  claims?: Claims | null;
  claimsError?: { message: string } | null;
  aal?: { currentLevel: string | null; nextLevel: string | null };
  aalError?: { message: string } | null;
}

function createFakeClient(options: FakeClientOptions) {
  const getClaims = vi.fn().mockResolvedValue({
    data: options.claims === undefined ? null : { claims: options.claims },
    error: options.claimsError ?? null,
  });

  const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
    data: options.aal ?? null,
    error: options.aalError ?? null,
  });

  const client = {
    auth: {
      getClaims,
      mfa: { getAuthenticatorAssuranceLevel },
    },
  } as unknown as SupabaseClient;

  return { client, getClaims, getAuthenticatorAssuranceLevel };
}

const validClaims: Claims = {
  sub: 'user-1',
  aal: 'aal1',
  email: 'user@test.dev',
  app_metadata: {},
};

describe('requireUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('unauthenticated', () => {
    it('returns an AuthenticationError redirecting to the default sign-in path', async () => {
      const { client } = createFakeClient({ claims: null });

      const result = await requireUser(client);

      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
      expect(result).toMatchObject({ redirectTo: '/auth/sign-in' });
    });

    it('honours a custom signInPath override', async () => {
      const { client } = createFakeClient({ claims: null });

      const result = await requireUser(client, { signInPath: '/login' });

      expect(result).toMatchObject({ redirectTo: '/login' });
    });

    it('appends the `next` param to the redirect', async () => {
      const { client } = createFakeClient({ claims: null });

      const result = await requireUser(client, { next: '/dashboard' });

      expect(result).toMatchObject({
        redirectTo: '/auth/sign-in?next=/dashboard',
      });
    });

    it('treats a getClaims error as unauthenticated', async () => {
      const { client } = createFakeClient({
        claims: validClaims,
        claimsError: { message: 'boom' },
      });

      const result = await requireUser(client);

      expect(result.error).not.toBeNull();
      expect(result).toMatchObject({ redirectTo: '/auth/sign-in' });
    });
  });

  describe('mfa enforcement', () => {
    it('redirects to the MFA verify path when a step-up is required', async () => {
      const { client } = createFakeClient({
        claims: validClaims,
        aal: { currentLevel: 'aal1', nextLevel: 'aal2' },
      });

      const result = await requireUser(client);

      expect(result.error).toBeInstanceOf(MultiFactorAuthError);
      expect(result).toMatchObject({ redirectTo: '/auth/verify' });
    });

    it('honours a custom mfaVerifyPath override', async () => {
      const { client } = createFakeClient({
        claims: validClaims,
        aal: { currentLevel: 'aal1', nextLevel: 'aal2' },
      });

      const result = await requireUser(client, { mfaVerifyPath: '/mfa' });

      expect(result.error).toBeInstanceOf(MultiFactorAuthError);
      expect(result).toMatchObject({ redirectTo: '/mfa' });
    });

    it('skips the MFA check entirely when verifyMfa is false', async () => {
      const { client, getAuthenticatorAssuranceLevel } = createFakeClient({
        claims: validClaims,
        aal: { currentLevel: 'aal1', nextLevel: 'aal2' },
      });

      const result = await requireUser(client, { verifyMfa: false });

      expect(result.error).toBeNull();
      expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
    });

    it('does not require MFA when current and next levels already match', async () => {
      const { client } = createFakeClient({
        claims: validClaims,
        aal: { currentLevel: 'aal1', nextLevel: 'aal1' },
      });

      const result = await requireUser(client);

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ id: 'user-1' });
    });
  });

  describe('success', () => {
    it('maps claims into JWTUserData', async () => {
      const { client } = createFakeClient({
        claims: {
          sub: 'user-1',
          aal: 'aal2',
          email: 'user@test.dev',
          app_metadata: { role: 'super-admin' },
        },
        aal: { currentLevel: 'aal2', nextLevel: 'aal2' },
      });

      const result = await requireUser(client);

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({
        id: 'user-1',
        email: 'user@test.dev',
        is_superadmin: true,
      });
    });
  });

  describe('bearer token path', () => {
    it('forwards the token to getClaims and the token-based AAL check', async () => {
      const { client, getClaims, getAuthenticatorAssuranceLevel } =
        createFakeClient({
          claims: validClaims,
          aal: { currentLevel: 'aal1', nextLevel: 'aal1' },
        });

      await requireUser(client, { token: 'jwt-123' });

      expect(getClaims).toHaveBeenCalledWith('jwt-123');
      expect(getAuthenticatorAssuranceLevel).toHaveBeenCalledWith('jwt-123');
    });

    it('uses the session-based AAL check (no token arg) for cookie callers', async () => {
      const { client, getClaims, getAuthenticatorAssuranceLevel } =
        createFakeClient({
          claims: validClaims,
          aal: { currentLevel: 'aal1', nextLevel: 'aal1' },
        });

      await requireUser(client);

      expect(getClaims).toHaveBeenCalledWith(undefined);
      expect(getAuthenticatorAssuranceLevel).toHaveBeenCalledWith();
    });

    it('throws when the token-based assurance lookup errors', async () => {
      const { client } = createFakeClient({
        claims: validClaims,
        aalError: { message: 'aal lookup failed' },
      });

      await expect(requireUser(client, { token: 'jwt-123' })).rejects.toThrow(
        'aal lookup failed',
      );
    });
  });
});
