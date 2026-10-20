/**
 * *Server function* de la pantalla para unirse a un equipo mediante una
 * invitación (`/join`).
 *
 * [TFG] RF-05 · RNF-02: la invitación solo es válida para el email al que se
 * envió, y el token se lee con el cliente administrador porque la columna
 * `invite_token` no es visible para los usuarios (07-invitations.sql).
 */
import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { errorMiddleware } from '@pymekit/function-middleware/server';
import { getLogger } from '@pymekit/shared/logger';
import {
  MultiFactorAuthError,
  requireUser,
} from '@pymekit/supabase/require-user';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';
import { createTeamAccountsApi } from '@pymekit/team-accounts/api';

import authConfig from '#/config/auth.config.ts';
import pathsConfig from '#/config/paths.config.ts';

const JoinSearchSchema = z.object({
  invite_token: z.string().min(1),
  type: z.enum(['invite', 'magic-link']).optional(),
  email: z.string().optional(),
  is_new_user: z.boolean().optional(),
});

/**
 * Prepara la pantalla de aceptación de una invitación a un equipo.
 *
 * Exige una sesión cuyo email coincida con el de la invitación. A los
 * visitantes sin sesión se les envía al registro (y a quien tiene la MFA
 * pendiente, a verificarla) conservando el token para que vuelvan aquí; a
 * quien ya es miembro, a la portada. Si todo es correcto devuelve lo que
 * necesita `AcceptInvitationContainer`, incluida la ruta siguiente (el paso
 * de configurar un método de acceso para cuentas nuevas que lo necesiten o,
 * si no, la portada del equipo).
 */
export const fetchJoinInvitation = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .validator(JoinSearchSchema)
  .handler(async ({ data }) => {
    const token = data.invite_token;
    const client = getSupabaseServerClient();
    const auth = await requireUser(client);

    // Sin sesión (o con la MFA pendiente): se pasa por el flujo de
    // autenticación llevando el token, para volver aquí al terminar.
    if (auth.error ?? !auth.data) {
      if (auth.error instanceof MultiFactorAuthError) {
        const next = `${pathsConfig.app.joinTeam}?invite_token=${token}&email=${
          data.email ?? ''
        }`;

        throw redirect({
          href: `${pathsConfig.auth.verifyMfa}?next=${encodeURIComponent(next)}`,
        });
      }

      throw redirect({
        href: `${pathsConfig.auth.signUp}?invite_token=${encodeURIComponent(
          token,
        )}`,
      });
    }

    // Cliente administrador: el usuario aún no es miembro y la columna
    // invite_token no se concede a authenticated, así que solo así se puede
    // buscar la invitación por su token. Justo debajo se valida a mano que el
    // email coincide antes de devolver nada.
    const adminClient = getSupabaseServerAdminClient();
    const api = createTeamAccountsApi(client);

    const invitation = await api.getInvitation(adminClient, token);

    // La invitación debe existir y ser para el email del usuario con sesión.
    const isInvitationValid =
      invitation &&
      invitation.email.toLowerCase() === auth.data.email?.toLowerCase();

    if (!isInvitationValid) {
      return { status: 'invalid' as const };
    }

    // Si ya comparte equipo con la cuenta, ya es miembro.
    const { data: isAlreadyTeamMember } = await client.rpc(
      'is_account_team_member',
      { target_account_id: invitation.account.id },
    );

    if (isAlreadyTeamMember) {
      const logger = await getLogger();

      logger.warn(
        {
          name: 'join-team-account',
          accountId: invitation.account.id,
          userId: auth.data.id,
        },
        'User is already in the account. Redirecting to account page.',
      );

      throw redirect({ href: pathsConfig.app.home });
    }

    // Si quiere entrar con otra cuenta, vuelve al flujo por el inicio de
    // sesión.
    const signOutNext = `${pathsConfig.auth.signIn}?invite_token=${token}`;

    // Al aceptar, el equipo pasa a ser la cuenta activa, así que el usuario
    // llega al panel ya dentro de él.
    const accountHome = pathsConfig.app.home;

    // El paso de configurar la cuenta (paso 2) solo se muestra a cuentas
    // nuevas y solo si NO hay acceso únicamente por email (enlace mágico u
    // OTP); en ese caso el usuario ya tiene un método de acceso válido.
    const supportsEmailOnlyAuth =
      authConfig.providers.magicLink || authConfig.providers.otp;

    const isNewAccount = data.is_new_user === true || data.type === 'invite';
    const shouldSetupAccount = isNewAccount && !supportsEmailOnlyAuth;

    const nextPath = shouldSetupAccount
      ? `/identities?next=${encodeURIComponent(accountHome)}`
      : accountHome;

    return {
      status: 'valid' as const,
      email: auth.data.email ?? '',
      token,
      invitation,
      paths: { signOutNext, nextPath },
    };
  });
