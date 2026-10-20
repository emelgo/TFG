/**
 * *Middleware* y guardas de autorización para las *server functions*.
 *
 * Es la capa de seguridad común de la aplicación web: cada *server function*
 * que toca datos pasa por aquí antes de ejecutar su *handler*. Comprueba la
 * sesión, el rol de superadministrador o la pertenencia a una cuenta de
 * equipo, y normaliza los errores para no filtrar detalles internos.
 * Las comprobaciones de pertenencia, rol y permiso se delegan en funciones
 * SQL (`has_role_on_account`, `has_permission`...) llamadas con el cliente de
 * Supabase del usuario, de modo que se evalúan con su identidad y las mismas
 * reglas que usa la RLS.
 *
 * Lo consumen las tuplas de `functions.ts` y, a través de `server.ts`, las
 * guardas adicionales de cada *server function*.
 */
import { isNotFound, isRedirect, redirect } from '@tanstack/react-router';
import { createMiddleware } from '@tanstack/react-start';
import * as z from 'zod';

import { type Database } from '@pymekit/supabase/database';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

export type AppPermission = Database['public']['Enums']['app_permissions'];

/**
 * Forma mínima de la entrada que necesitan las guardas por cuenta. El
 * `.validator` de cada *server function* declara el esquema completo
 * (ampliando este); aquí se vuelve a comprobar, desde el *middleware*, que
 * llega un `accountId` con formato uuid.
 */
const AccountIdSchema = z.object({ accountId: z.uuid() });

/** Extrae y valida el `accountId` (uuid) de la entrada de la función. */
function extractAccountId(data: unknown): string {
  return AccountIdSchema.parse(data).accountId;
}

/**
 * Frontera de normalización de errores: al cliente solo llega el mensaje del
 * error, nunca la pila ni otros detalles internos. Las señales de control del
 * *router* (`redirect` y `notFound`) se dejan pasar intactas para que la
 * navegación siga funcionando.
 */
export const errorMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (isRedirect(error) || isNotFound(error)) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Internal Server Error';

      // Se lanza un Error nuevo para que no se serialicen la pila ni las
      // propiedades internas del original.
      throw new Error(message);
    }
  },
);

/**
 * *Middleware* de autenticación: exige una sesión válida y añade
 * `context.user` (datos del JWT). Si no hay sesión, redirige a la página de
 * inicio de sesión (o a la verificación MFA, según indique `requireUser`).
 */
export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const client = getSupabaseServerClient();
    const auth = await requireUser(client);

    if (!auth.data) {
      throw redirect({ to: auth.redirectTo });
    }

    return next({ context: { user: auth.data } });
  },
);

/**
 * *Middleware* de superadministrador: exige `context.user.is_superadmin`, que
 * se calcula a partir del JWT (rol `super-admin` en `app_metadata` y sesión
 * `aal2`). Es la misma condición que aplica `public.is_super_admin()` en las
 * políticas RLS.
 */
export const adminMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    if (!context.user.is_superadmin) {
      throw new Error('Forbidden');
    }

    return next({ context });
  });

/**
 * *Middleware* de cuenta de equipo: valida el `accountId` de la entrada y
 * comprueba que el usuario es miembro con la RPC `has_role_on_account`. Se usa
 * el cliente con la sesión del usuario (sujeto a RLS), no el administrador,
 * para que la comprobación se haga con su identidad. Añade
 * `context.accountId`.
 *
 * La *server function* DEBE declarar un `.validator` con la forma
 * `{ accountId: string }`: `data` es la entrada ya validada.
 */
export const teamAccountMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, data }) => {
    const accountId = extractAccountId(data);
    const client = getSupabaseServerClient();

    const { data: hasRole, error } = await client.rpc('has_role_on_account', {
      account_id: accountId,
    });

    if (error) {
      throw new Error('Membership check failed');
    }

    if (!hasRole) {
      throw new Error('Unauthorized');
    }

    return next({ context: { accountId } });
  });

/**
 * Guarda que exige, en la cuenta, un rol de jerarquía IGUAL O SUPERIOR a
 * `role`. `has_role_on_account` compara el rol de forma exacta y no sirve
 * para expresar "rol mínimo" (un propietario no pasaría
 * `withMinRole('member')`), así que se combinan las dos RPC de jerarquía:
 * `has_more_elevated_role` (estrictamente superior) O
 * `has_same_role_hierarchy_level` (igual).
 *
 * @param role Nombre del rol mínimo exigido (por ejemplo, `'owner'`).
 */
export function withMinRole(role: string) {
  return createMiddleware({ type: 'function' })
    .middleware([authMiddleware])
    .server(async ({ next, data, context }) => {
      const accountId = extractAccountId(data);
      const client = getSupabaseServerClient();

      const [moreElevated, sameLevel] = await Promise.all([
        client.rpc('has_more_elevated_role', {
          target_user_id: context.user.id,
          target_account_id: accountId,
          role_name: role,
        }),
        client.rpc('has_same_role_hierarchy_level', {
          target_user_id: context.user.id,
          target_account_id: accountId,
          role_name: role,
        }),
      ]);

      const allowed = moreElevated.data || sameLevel.data;

      if (moreElevated.error || sameLevel.error || !allowed) {
        throw new Error(`Unauthorized: ${role} role or higher required`);
      }

      return next({ context: { accountId } });
    });
}

/**
 * Guarda que exige un permiso de la aplicación (`app_permissions`) en la
 * cuenta, comprobado con la RPC `has_permission` para el usuario de la sesión
 * y el `accountId` de la entrada. Es la forma preferida de autorizar, porque
 * no depende de nombres de rol concretos.
 *
 * @param permission Permiso exigido (por ejemplo, `'members.manage'`).
 */
export function withFeaturePermission(permission: AppPermission) {
  return createMiddleware({ type: 'function' })
    .middleware([authMiddleware])
    .server(async ({ next, data, context }) => {
      const accountId = extractAccountId(data);
      const client = getSupabaseServerClient();

      const { data: allowed, error } = await client.rpc('has_permission', {
        account_id: accountId,
        user_id: context.user.id,
        permission_name: permission,
      });

      if (error || !allowed) {
        throw new Error('Unauthorized');
      }

      return next({ context: { accountId } });
    });
}

/**
 * TODO(futuro): guarda `withCaptcha`. `verifyCaptchaToken` ya está disponible
 * en `@pymekit/auth/captcha/server`, pero de momento la única función que la
 * necesita (el formulario de contacto) la llama directamente. Si se
 * generaliza, bastaría con algo como:
 *
 *   export const captchaMiddleware = createMiddleware({ type: 'function' })
 *     .server(async ({ next, data }) => {
 *       await verifyCaptchaToken(
 *         (data as { captchaToken?: string })?.captchaToken ?? '',
 *       );
 *       return next();
 *     });
 *
 * y una guarda `withCaptcha` que la envuelva.
 */
