import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { createAccountsApi } from '@pymekit/accounts/api';
import { errorMiddleware } from '@pymekit/function-middleware/server';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import featureFlagsConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';

/**
 * Guarda de la ruta `/create-team` (alta del primer equipo en el modo solo
 * equipos).
 *
 * Redirige a la portada si el modo solo equipos está desactivado o si el
 * usuario ya pertenece a algún equipo. En otro caso deja que la ruta muestre
 * el formulario de creación.
 */
export const fetchCreateTeamState = createServerFn({ method: 'GET' })
  // Se normalizan los errores para no enviar al navegador los de PostgREST
  // (las redirecciones pasan intactas).
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

    // Ya tiene equipo: se le envía al panel, donde la cuenta activa guardada
    // en la base de datos se resuelve a su equipo actual o al primero.
    if (accounts.length > 0) {
      throw redirect({ href: pathsConfig.app.home });
    }

    return { ready: true };
  });
