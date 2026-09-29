import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { createAccountsApi } from '@pymekit/accounts/api';
import { errorMiddleware } from '@pymekit/function-middleware/server';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import featureFlagsConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';

/**
 * Gate for the standalone `/create-team` onboarding route.
 *
 * Redirects home when teams-only mode is disabled, and to the user's first
 * team when they already belong to one. Otherwise resolves so the route can
 * render the create-first-team form.
 */
export const fetchCreateTeamState = createServerFn({ method: 'GET' })
  // Normalize failures so raw Postgrest errors are not serialized to the
  // browser (redirects pass through untouched).
  .middleware([errorMiddleware])
  .handler(async () => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    if (!featureFlagsConfig.enableTeamsOnly) {
      throw redirect({ href: pathsConfig.app.home });
    }

    const api = createAccountsApi(client);
    const accounts = await api.loadUserAccounts();

    // The user already has a team: send them to the dashboard, where the
    // DB-backed active account resolves to their current/first team.
    if (accounts.length > 0) {
      throw redirect({ href: pathsConfig.app.home });
    }

    return { ready: true };
  });
