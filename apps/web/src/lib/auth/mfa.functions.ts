import {
  isAuthApiError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';

import { createServerFn } from '@tanstack/react-start';

import { getLogger } from '@pymekit/shared/logger';
import { checkRequiresMultiFactorAuthentication } from '@pymekit/supabase/check-requires-mfa';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

/**
 * Resolves the current user for the MFA challenge screen.
 *
 * Supabase gives a user with MFA enrolled an `aal1` session immediately after
 * password sign-in, so a session already exists here — we gate on the assurance
 * level instead. Returns `{ userId: null }` when there is no session or MFA is
 * not required; the route loader turns that into a redirect back to sign-in.
 */
export const fetchMfaChallenge = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ userId: string | null }> => {
    const client = getSupabaseServerClient();
    const { data } = await client.auth.getClaims();

    if (!data?.claims) {
      return { userId: null };
    }

    const needsMfa = await checkRequiresMultiFactorAuthentication(client);

    if (!needsMfa) {
      return { userId: null };
    }

    return { userId: data.claims.sub };
  },
);

/**
 * Boolean MFA gate for the authenticated route guard.
 *
 * Returns `true` when the current session is authenticated but sits at a lower
 * assurance level than the user's enrolled factors require (i.e. an `aal1`
 * session that must step up to `aal2`). Returns `false` when there is no session
 * — the route's auth gate handles the sign-in redirect in that case.
 */
export const fetchRequiresMfa = createServerFn({ method: 'GET' }).handler(
  async (): Promise<boolean> => {
    const client = getSupabaseServerClient();
    const { data } = await client.auth.getClaims();

    if (!data?.claims) {
      return false;
    }

    return checkRequiresMultiFactorAuthentication(client);
  },
);

/** Códigos de error de Auth que indican que la sesión ya no es válida. */
const DEAD_SESSION_CODES = new Set([
  'session_not_found',
  'refresh_token_not_found',
  'user_not_found',
  'bad_jwt',
]);

/**
 * Comprueba si un error de Supabase Auth significa «esta sesión ya no
 * existe»: sesión borrada o revocada, *refresh token* desconocido (p. ej.
 * tras `supabase db reset`) o usuario eliminado. Los fallos de red o los 5xx
 * NO cuentan: no se debe cerrar la sesión de nadie porque Auth no responda.
 */
function isDeadSessionError(error: unknown) {
  if (isAuthSessionMissingError(error)) return true;

  // Solo códigos explícitos: un 401/403 genérico o un `refresh_token_already_used`
  // (dos peticiones que refrescan a la vez) NO significan que la sesión haya
  // muerto, y `signOut` la revocaría de verdad.
  return (
    isAuthApiError(error) && DEAD_SESSION_CODES.has(String(error.code ?? ''))
  );
}

/**
 * Guarda de las zonas privadas (`/_authenticated` y `/admin`), F3b.
 *
 * El `beforeLoad` raíz identifica al usuario con `getClaims()`, que con
 * claves asimétricas valida el JWT EN LOCAL: si la sesión se ha borrado en la
 * BD (revocada desde la consola, `db reset`…) el JWT sigue pareciendo válido
 * hasta que caduca y las páginas fallaban de formas raras (404, error
 * vacío). Aquí se pregunta a Auth con `getUser()`, que sí comprueba que la
 * sesión exista. Si no existe se borran las cookies (`signOut` local) y se
 * devuelve `signedOut`, para que la ruta redirija al inicio de sesión.
 *
 * De paso resuelve si falta el segundo factor, que es lo que antes hacía
 * `fetchRequiresMfa` en estas mismas guardas.
 *
 * [TFG] RNF-02: una sesión revocada deja de dar acceso aunque su JWT no haya
 * caducado todavía.
 */
export const fetchAuthGate = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ signedOut: boolean; requiresMfa: boolean }> => {
    const client = getSupabaseServerClient();
    const { data, error } = await client.auth.getUser();

    if (error || !data.user) {
      if (error && !isDeadSessionError(error)) {
        // Auth no disponible u otro fallo transitorio: no se expulsa al
        // usuario; se registra y se sigue con lo que dice el JWT.
        const logger = await getLogger();
        logger.warn(
          { name: 'auth.gate', error: error.message },
          'No se ha podido comprobar la sesión con Auth',
        );

        return {
          signedOut: false,
          requiresMfa: await checkRequiresMultiFactorAuthentication(client),
        };
      }

      // `scope: 'local'` solo limpia las cookies de este navegador; si la
      // sesión ya no existe, Auth responde 4xx y `signOut` lo ignora.
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);

      return { signedOut: true, requiresMfa: false };
    }

    return {
      signedOut: false,
      requiresMfa: await checkRequiresMultiFactorAuthentication(client),
    };
  },
);
