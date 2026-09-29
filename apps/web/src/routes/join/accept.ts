import type { SupabaseClient } from '@supabase/supabase-js';

import { createFileRoute } from '@tanstack/react-router';
import * as z from 'zod';

import { getLogger } from '@pymekit/shared/logger';
import type { Database } from '@pymekit/supabase/database';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { verifyInvitationToken } from '@pymekit/team-accounts/invitation-signature';

import appConfig from '#/config/app.config.ts';
import pathsConfig from '#/config/paths.config.ts';

// invite tokens are v4 UUIDs (see add_invitations_to_account)
const InviteTokenSchema = z.uuid();

/**
 * Entry point for team invitation email links: `/join/accept?invite_token=xxx&sig=yyy`.
 *
 * A validly-*signed* link (the `sig` can only be produced server-side) triggers a
 * one-click join: we mint a fresh Supabase auth link on the fly and forward to
 * `/auth/confirm`, which signs the user in and lands them on `/join`. An unsigned
 * or invalid link never auto-authenticates — it is routed through the secure
 * sign-up/sign-in `/join` flow, where `requireUser` + the email-match check gate
 * acceptance.
 *
 * SECURITY: the invite_token alone is NOT sufficient to mint a session — it is
 * readable by members of the inviting account (data API / RLS). Only the `sig`,
 * which a token-reader cannot forge, unlocks the one-click path.
 * See @pymekit/team-accounts/invitation-signature.
 */
export const Route = createFileRoute('/join/accept')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const logger = await getLogger();
        const { searchParams } = new URL(request.url);
        const inviteToken = searchParams.get('invite_token');
        const signature = searchParams.get('sig');

        const ctx = {
          name: 'join.accept',
          inviteTokenFingerprint: getSecretFingerprint(inviteToken),
        };

        // Cheap input hygiene: token must be present and a well-formed UUID.
        if (!inviteToken || !InviteTokenSchema.safeParse(inviteToken).success) {
          logger.warn(ctx, 'Missing or malformed invite_token parameter');

          return redirectToError('Invalid invitation link');
        }

        // Unsigned / invalid link: never auto-authenticate.
        if (!verifyInvitationToken(inviteToken, signature)) {
          logger.info(
            ctx,
            'Unsigned/invalid invitation link; routing through secure join flow',
          );

          return redirectToSecureJoin(inviteToken);
        }

        try {
          const adminClient = getSupabaseServerAdminClient();

          const { data: invitation, error: invitationError } = await adminClient
            .from('invitations')
            .select('id, email')
            .eq('invite_token', inviteToken)
            .gte('expires_at', new Date().toISOString())
            .single();

          if (invitationError || !invitation) {
            logger.warn(
              { ...ctx, error: invitationError },
              'Invitation not found or expired',
            );

            return redirectToError('Invitation not found or expired');
          }

          logger.info(
            { ...ctx, invitationId: invitation.id },
            'Valid signed invitation found. Generating auth link...',
          );

          // 'invite' for new users (creates the account + authenticates),
          // 'magiclink' for existing users (authenticates only).
          const emailLinkType = await determineEmailLinkType(
            adminClient,
            invitation.email,
          );

          const generateLinkResponse =
            await adminClient.auth.admin.generateLink({
              email: invitation.email,
              type: emailLinkType,
            });

          if (generateLinkResponse.error) {
            logger.error(
              { ...ctx, error: generateLinkResponse.error },
              'Failed to generate auth link',
            );

            throw generateLinkResponse.error;
          }

          const verifyLink = generateLinkResponse.data.properties?.action_link;
          const token = verifyLink
            ? new URL(verifyLink).searchParams.get('token')
            : null;

          if (!token) {
            logger.error(ctx, 'Token not found in generated link');
            throw new Error(
              'Token in verify link from Supabase Auth was not found',
            );
          }

          const siteUrl = appConfig.url;
          const authCallbackUrl = new URL('/auth/confirm', siteUrl);

          authCallbackUrl.searchParams.set('token_hash', token);
          authCallbackUrl.searchParams.set('type', emailLinkType);

          // After auth, land the user on the secure /join page.
          const joinUrl = new URL(pathsConfig.app.joinTeam, siteUrl);
          joinUrl.searchParams.set('invite_token', inviteToken);

          // Signal a brand-new account so /join can route to /identities setup.
          if (emailLinkType === 'invite') {
            joinUrl.searchParams.set('is_new_user', 'true');
          }

          authCallbackUrl.searchParams.set(
            'next',
            joinUrl.pathname + joinUrl.search,
          );

          logger.info(
            { ...ctx, redirectUrl: authCallbackUrl.pathname },
            'Redirecting to auth confirmation with fresh token',
          );

          return redirectTo(authCallbackUrl.toString());
        } catch (error) {
          logger.error(
            { ...ctx, error },
            'Failed to process invitation acceptance',
          );

          return redirectToError(
            'An error occurred processing your invitation',
          );
        }
      },
    },
  },
});

/**
 * Determine whether to use 'invite' (new user) or 'magiclink' (existing user).
 */
async function determineEmailLinkType(
  adminClient: SupabaseClient<Database>,
  email: string,
): Promise<'invite' | 'magiclink'> {
  const user = await adminClient
    .from('accounts')
    .select('id')
    .eq('email', email)
    .single();

  if (user.error || !user.data) {
    return 'invite';
  }

  return 'magiclink';
}

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

/**
 * Forward to the secure /join page via sign-up, preserving the invite token in
 * `next`. No session is minted from the token on this path.
 */
function redirectToSecureJoin(inviteToken: string) {
  const siteUrl = appConfig.url;

  const joinUrl = new URL(pathsConfig.app.joinTeam, siteUrl);
  joinUrl.searchParams.set('invite_token', inviteToken);

  const signUpUrl = new URL(pathsConfig.auth.signUp, siteUrl);
  signUpUrl.searchParams.set('next', joinUrl.pathname + joinUrl.search);

  return redirectTo(signUpUrl.toString());
}

function redirectToError(message: string) {
  const errorUrl = new URL(pathsConfig.app.joinTeam, appConfig.url);
  errorUrl.searchParams.set('error', message);

  return redirectTo(errorUrl.toString());
}

function getSecretFingerprint(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return '[redacted]';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
