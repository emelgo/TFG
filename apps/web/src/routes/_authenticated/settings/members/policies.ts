import { createFileRoute } from '@tanstack/react-router';

import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';
import {
  createInvitationContextBuilder,
  createInvitationsPolicyEvaluator,
} from '@pymekit/team-accounts/policies';

/**
 * Preliminary invitation-policy check for the invite-members dialog.
 *
 * The dialog fetches this (relative `./members/policies`) when it opens to
 * decide whether inviting is allowed for the active account/plan. The account
 * is resolved from the DB-backed active account (no URL slug); a personal
 * active account cannot invite. Returns `{ allowed, reasons, metadata }` JSON.
 */
export const Route = createFileRoute(
  '/_authenticated/settings/members/policies',
)({
  server: {
    handlers: {
      GET: async () => {
        const client = getSupabaseServerClient();
        const auth = await requireUser(client);

        if (auth.error || !auth.data) {
          return new Response('Unauthorized', { status: 401 });
        }

        const workspace = await client.rpc('active_account_workspace');
        const account = workspace.data?.[0];

        if (
          workspace.error ||
          !account ||
          account.is_personal_account ||
          !account.slug
        ) {
          return Response.json(
            {
              allowed: false,
              reasons: ['No active team account'],
              metadata: { error: true },
            },
            { status: 400 },
          );
        }

        try {
          const evaluator = createInvitationsPolicyEvaluator();
          const hasPolicies =
            await evaluator.hasPoliciesForStage('preliminary');

          if (!hasPolicies) {
            return Response.json({
              allowed: true,
              reasons: [],
              metadata: {
                policiesEvaluated: 0,
                timestamp: new Date().toISOString(),
                noPoliciesConfigured: true,
              },
            });
          }

          const contextBuilder = createInvitationContextBuilder(client);

          const context = await contextBuilder.buildContext(
            { invitations: [], accountSlug: account.slug },
            auth.data,
          );

          const result = await evaluator.canInvite(context, 'preliminary');

          return Response.json(result);
        } catch (error) {
          return Response.json(
            {
              allowed: false,
              reasons: [
                error instanceof Error
                  ? error.message
                  : 'Unknown error occurred',
              ],
              metadata: {
                error: true,
                originalError:
                  error instanceof Error ? error.message : String(error),
              },
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
