/**
 * *Server functions* del espacio de trabajo activo.
 *
 * Cargan los datos que necesita la zona autenticada (cuenta activa, equipos
 * disponibles y usuario) y permiten cambiar de cuenta. La cuenta activa se
 * guarda en la base de datos (`user_active_account`) y se resuelve allí con
 * `active_account_workspace`, así que el servidor nunca confía en un id de
 * cuenta enviado por el cliente para decidir dónde trabaja el usuario.
 * También aplican el modo de cuentas configurado (solo personal, solo
 * equipos o mixto).
 *
 * [TFG] RF-05 Multi-tenant: ver Memoria §Diseño > Modelo de datos.
 */
import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { errorMiddleware } from '@pymekit/function-middleware/server';
import { canSwitchContext } from '@pymekit/shared/mode-utils';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import { accountModeConfig } from '#/config/account-mode.config.ts';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import type {
  WorkspaceAccountSummary,
  WorkspaceShape,
} from '#/lib/server/workspace-shape.ts';

export type { WorkspaceShape } from '#/lib/server/workspace-shape.ts';

const shouldLoadAccounts = featureFlagsConfig.enableTeamAccounts;

/**
 * Carga el espacio de trabajo de la zona autenticada: la cuenta activa
 * (resuelta en la base de datos, con la personal como respaldo), los equipos
 * a los que se puede cambiar y el usuario actual.
 */
export const fetchWorkspace = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .handler(async (): Promise<WorkspaceShape> => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    const accountsPromise = shouldLoadAccounts
      ? client
          .from('user_accounts')
          .select('*')
          .order('name', { ascending: true })
      : Promise.resolve({
          data: [] as WorkspaceAccountSummary[],
          error: null,
        });

    const [workspaceResult, accountsResult] = await Promise.all([
      client.rpc('active_account_workspace'),
      accountsPromise,
    ]);

    if (workspaceResult.error) {
      throw workspaceResult.error;
    }

    // La función SQL siempre devuelve al menos la cuenta personal; un resultado
    // vacío significa que esa fila ya no existe (usuario borrado o JWT
    // obsoleto).
    let account = workspaceResult.data[0];

    if (!account) {
      throw redirect({ href: '/' });
    }

    if (accountsResult.error) {
      throw accountsResult.error;
    }

    // Modo solo equipos: se activa el primer equipo para que la cuenta
    // personal no sea el espacio de trabajo. Si el usuario no tiene ningún
    // equipo, la cuenta sigue siendo la personal y la guarda `_authenticated`
    // le envía a crear uno (esa ruta no debe redirigirse a su vez; ver
    // route.tsx).
    if (
      featureFlagsConfig.enableTeamsOnly &&
      account.is_personal_account &&
      accountsResult.data[0]?.id
    ) {
      await client.rpc('set_active_account', {
        target_account_id: accountsResult.data[0].id,
      });

      const promoted = await client.rpc('active_account_workspace');

      if (promoted.error) {
        throw promoted.error;
      }

      account = promoted.data[0] ?? account;
    }

    // Modo solo personal: un puntero antiguo a un equipo nunca debe ser el
    // espacio de trabajo. Se vuelve a la cuenta personal, lo que corrige solo
    // un cambio de modo tras el lanzamiento o una membresía creada por otra
    // vía (el selector de equipos está oculto y no habría forma de volver).
    // Pasar el id del usuario selecciona la cuenta personal (ver
    // `set_active_account`).
    if (
      accountModeConfig.mode === 'personal-only' &&
      !account.is_personal_account
    ) {
      await client.rpc('set_active_account', {
        target_account_id: auth.data.id,
      });

      const demoted = await client.rpc('active_account_workspace');

      if (demoted.error) {
        throw demoted.error;
      }

      account = demoted.data[0] ?? account;
    }

    return {
      account,
      accounts: accountsResult.data,
      user: auth.data,
    };
  });

/**
 * Cambia la cuenta activa del usuario (la personal o un equipo del que sea
 * miembro).
 *
 * La comprobación de pertenencia la hace la función SQL `set_active_account`
 * (y su política RLS); aquí solo se aplica el modo de cuentas. Después, el
 * cliente llama a `router.invalidate()` para que todos los *loaders* se
 * vuelvan a ejecutar con la nueva cuenta.
 */
export const setActiveAccountFunction = createServerFn({ method: 'POST' })
  .middleware([errorMiddleware])
  .validator(z.object({ accountId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    // La cuenta personal tiene el mismo id que el usuario; cualquier otra es un
    // equipo.
    const targetIsOrganization = data.accountId !== auth.data.id;

    const switchCheck = canSwitchContext(
      accountModeConfig.mode,
      targetIsOrganization,
    );

    if (!switchCheck.allowed) {
      throw new Error(
        switchCheck.reason ??
          'Context switching is not allowed in the current account mode',
      );
    }

    const { error } = await client.rpc('set_active_account', {
      target_account_id: data.accountId,
    });

    if (error) {
      throw error;
    }

    return { success: true } as const;
  });
