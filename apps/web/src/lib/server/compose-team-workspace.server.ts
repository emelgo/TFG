import { type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@pymekit/supabase/database';
import type { JWTUserData } from '@pymekit/supabase/types';
import { createTeamAccountsApi } from '@pymekit/team-accounts/api';
import type { TeamAccountWorkspaceShape } from '@pymekit/team-accounts/shared';

/**
 * Compone el espacio de trabajo de un equipo a partir del cliente
 * autenticado, el usuario y el slug del equipo.
 *
 * Devuelve `null` si el usuario no tiene acceso a ese slug (la RLS lo deniega,
 * el slug no existe o el equipo se está borrando); quien llama decide qué
 * hacer (los *loaders* redirigen a la portada). Se puede usar desde cualquier
 * contexto de servidor.
 */
export async function composeTeamWorkspace(
  client: SupabaseClient<Database>,
  user: JWTUserData,
  accountSlug: string,
): Promise<TeamAccountWorkspaceShape | null> {
  const api = createTeamAccountsApi(client);
  const workspace = await api.getAccountWorkspace(accountSlug);

  if (!workspace.data?.account) {
    return null;
  }

  return {
    ...workspace.data,
    user,
  };
}
