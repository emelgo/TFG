import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { errorMiddleware } from '@pymekit/function-middleware/server';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

/**
 * Carga los miembros y las invitaciones del equipo activo para la página de
 * miembros.
 *
 * La cuenta activa se resuelve dentro de las RPC, así que no se pasa ningún
 * slug desde el cliente; si la cuenta activa es la personal, las listas
 * llegan vacías. La RLS limita los datos a equipos de los que el usuario es
 * miembro.
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
