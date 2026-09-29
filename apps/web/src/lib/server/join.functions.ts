import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { errorMiddleware } from '@pymekit/function-middleware/server';
import { getLogger } from '@pymekit/shared/logger';
import {
  MultiFactorAuthError,
  requireUser,
} from '@pymekit/supabase/require-user';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';
import { createTeamAccountsApi } from '@pymekit/team-accounts/api';

import authConfig from '#/config/auth.config.ts';
import pathsConfig from '#/config/paths.config.ts';

const JoinSearchSchema = z.object({
  invite_token: z.string().min(1),
  type: z.enum(['invite', 'magic-link']).optional(),
  email: z.string().optional(),
  is_new_user: z.boolean().optional(),
});

/**
 * Resolves the team-invitation join screen.
 *
 * Requires an authenticated session whose email matches the invitation. Anonymous
 * visitors are forwarded to sign-up (MFA-pending users to the verify screen),
 * preserving the invite token so they return here afterwards. Already-members are
 * sent home. On success it returns everything `AcceptInvitationContainer` needs,
 * including the post-accept `nextPath` (the /identities setup step for brand-new
 * accounts that still need an auth method, otherwise the team home).
 */
export const fetchJoinInvitation = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .validator(JoinSearchSchema)
  .handler(async ({ data }) => {
    const token = data.invite_token;
    const client = getSupabaseServerClient();
    const auth = await requireUser(client);

    // Not signed in (or MFA-pending): route through the auth flow, carrying the
    // invite token so the user lands back here once authenticated.
    if (auth.error ?? !auth.data) {
      if (auth.error instanceof MultiFactorAuthError) {
        const next = `${pathsConfig.app.joinTeam}?invite_token=${token}&email=${
          data.email ?? ''
        }`;

        throw redirect({
          href: `${pathsConfig.auth.verifyMfa}?next=${encodeURIComponent(next)}`,
        });
      }

      throw redirect({
        href: `${pathsConfig.auth.signUp}?invite_token=${encodeURIComponent(
          token,
        )}`,
      });
    }

    const adminClient = getSupabaseServerAdminClient();
    const api = createTeamAccountsApi(client);

    const invitation = await api.getInvitation(adminClient, token);

    // The invitation must exist and belong to the signed-in user's email.
    const isInvitationValid =
      invitation &&
      invitation.email.toLowerCase() === auth.data.email?.toLowerCase();

    if (!isInvitationValid) {
      return { status: 'invalid' as const };
    }

    // If the user can already read the account, they are already a member.
    const { data: isAlreadyTeamMember } = await client.rpc(
      'is_account_team_member',
      { target_account_id: invitation.account.id },
    );

    if (isAlreadyTeamMember) {
      const logger = await getLogger();

      logger.warn(
        {
          name: 'join-team-account',
          accountId: invitation.account.id,
          userId: auth.data.id,
        },
        'User is already in the account. Redirecting to account page.',
      );

      throw redirect({ href: pathsConfig.app.home });
    }

    // Signing in with a different account re-enters the flow via sign-in.
    const signOutNext = `${pathsConfig.auth.signIn}?invite_token=${token}`;

    // The accept flow sets the joined team as the active account, so the user
    // lands on the dashboard in that workspace.
    const accountHome = pathsConfig.app.home;

    // Show the account-setup step (Step 2) only for brand-new accounts, and only
    // when email-only auth (magic link / OTP) is NOT supported — otherwise the
    // user already has a usable sign-in method.
    const supportsEmailOnlyAuth =
      authConfig.providers.magicLink || authConfig.providers.otp;

    const isNewAccount = data.is_new_user === true || data.type === 'invite';
    const shouldSetupAccount = isNewAccount && !supportsEmailOnlyAuth;

    const nextPath = shouldSetupAccount
      ? `/identities?next=${encodeURIComponent(accountHome)}`
      : accountHome;

    return {
      status: 'valid' as const,
      email: auth.data.email ?? '',
      token,
      invitation,
      paths: { signOutNext, nextPath },
    };
  });
