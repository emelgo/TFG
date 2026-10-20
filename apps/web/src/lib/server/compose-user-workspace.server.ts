import type { SupabaseClient } from '@supabase/supabase-js';

import { createAccountsApi } from '@pymekit/accounts/api';
import type { UserWorkspaceShape } from '@pymekit/accounts/shared';
import type { Database } from '@pymekit/supabase/database';
import type { JWTUserData } from '@pymekit/supabase/types';
import { createAccountCreationPolicyEvaluator } from '@pymekit/team-accounts/policies';

import featureFlagsConfig from '#/config/feature-flags.config.ts';

const shouldLoadAccounts = featureFlagsConfig.enableTeamAccounts;

/**
 * Compone el espacio de trabajo personal del usuario: sus cuentas, los datos
 * de su cuenta personal y si puede crear equipos.
 *
 * Devuelve `null` si no hay espacio accesible (JWT no válido o caducado, o
 * usuario borrado); quien llama decide qué hacer. Se puede usar desde
 * cualquier contexto de servidor.
 */
export async function composeUserWorkspace(
  client: SupabaseClient<Database>,
  user: JWTUserData,
): Promise<UserWorkspaceShape | null> {
  const api = createAccountsApi(client);

  const accountsPromise = shouldLoadAccounts
    ? api.loadUserAccounts()
    : Promise.resolve([]);

  const workspacePromise = api.getAccountWorkspace();

  const [accounts, workspace] = await Promise.all([
    accountsPromise,
    workspacePromise,
  ]);

  if (!workspace) {
    return null;
  }

  const canCreateTeamAccount = shouldLoadAccounts
    ? await checkCanCreateTeamAccount(user.id)
    : { allowed: false, reason: undefined };

  return {
    accounts,
    workspace,
    user,
    canCreateTeamAccount,
  };
}

/**
 * Comprueba con las políticas de negocio si el usuario puede crear un equipo.
 * Solo se evalúa la fase `preliminary` (sin nombre de equipo), para avisar en
 * la interfaz; la validación del nombre se hace al enviar el formulario.
 */
async function checkCanCreateTeamAccount(userId: string) {
  const evaluator = createAccountCreationPolicyEvaluator();
  const hasPolicies = await evaluator.hasPoliciesForStage('preliminary');

  if (!hasPolicies) {
    return { allowed: true, reason: undefined };
  }

  const context = {
    timestamp: new Date().toISOString(),
    userId,
    accountName: '',
  };

  const result = await evaluator.canCreateAccount(context, 'preliminary');

  return {
    allowed: result.allowed,
    reason: result.reasons[0],
  };
}
