import { createFileRoute } from '@tanstack/react-router';

import { createAuthCallbackService } from '@pymekit/supabase/auth';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import pathsConfig from '#/config/paths.config.ts';

/**
 * OAuth / magic-link / PKCE code-exchange endpoint.
 *
 * Lives at `pathsConfig.auth.callback` (`/auth/callback`) because
 * `SignInMethodsContainer` builds the Supabase `redirectTo` from that same
 * value — the browser is redirected back here with `?code=...`. The SSR
 * Supabase client persists the session cookie during `exchangeCodeForSession`;
 * that `Set-Cookie` is attached to the outgoing 302.
 */
export const Route = createFileRoute('/auth/callback/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const service = createAuthCallbackService(getSupabaseServerClient());

        const { nextPath } = await service.exchangeCodeForSession(request, {
          joinTeamPath: pathsConfig.app.joinTeam,
          redirectPath: pathsConfig.app.home,
        });

        return new Response(null, {
          status: 302,
          headers: { Location: nextPath },
        });
      },
    },
  },
});
