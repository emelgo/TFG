import { createFileRoute } from '@tanstack/react-router';

import { createAuthCallbackService } from '@pymekit/supabase/auth';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import pathsConfig from '#/config/paths.config.ts';

/**
 * Email token-hash verification endpoint (email confirmation, recovery, invite).
 *
 * Supabase email templates link to `/auth/confirm?token_hash=...&type=...`. The
 * service verifies the OTP (setting the session cookie via the SSR client) and
 * returns the final destination `URL`; on failure it points at the callback
 * error page. The resulting `Set-Cookie` rides the outgoing 302.
 */
export const Route = createFileRoute('/auth/confirm')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const service = createAuthCallbackService(getSupabaseServerClient());

        const url = await service.verifyTokenHash(request, {
          joinTeamPath: pathsConfig.app.joinTeam,
          redirectPath: pathsConfig.app.home,
        });

        return new Response(null, {
          status: 302,
          headers: { Location: url.toString() },
        });
      },
    },
  },
});
