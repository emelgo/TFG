import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { errorMiddleware } from '@pymekit/function-middleware/server';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

/**
 * Loads the members + invitations for the active team account. The active
 * account is resolved inside the RPCs, so no slug is passed; a personal active
 * account yields empty lists.
 */
export const fetchActiveAccountMembersPageData = createServerFn({
  method: 'GET',
})
  .middleware([errorMiddleware])
  .handler(async () => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    const [members, invitations] = await Promise.all([
      client.rpc('get_active_account_members'),
      client.rpc('get_active_account_invitations'),
    ]);

    if (members.error) {
      throw members.error;
    }

    if (invitations.error) {
      throw invitations.error;
    }

    return {
      members: members.data ?? [],
      invitations: invitations.data ?? [],
    };
  });
