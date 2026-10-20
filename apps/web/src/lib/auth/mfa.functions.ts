/**
 * *Server functions* de las guardas de autenticación y MFA.
 *
 * Las usan los `beforeLoad` de las rutas privadas y la pantalla de
 * verificación del segundo factor para decidir, en el servidor, si el
 * usuario tiene sesión válida y si le falta completar la MFA.
 */
import {
  isAuthApiError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';

import { createServerFn } from '@tanstack/react-start';

import { getLogger } from '@pymekit/shared/logger';
import { checkRequiresMultiFactorAuthentication } from '@pymekit/supabase/check-requires-mfa';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

/**
 * Resuelve el usuario para la pantalla de verificación MFA.
 *
 * Tras iniciar sesión con contraseña, Supabase ya da una sesión `aal1` al
 * usuario con MFA, así que aquí siempre hay sesión: lo que se comprueba es el
 * nivel de garantía. Devuelve `{ userId: null }` si no hay sesión o no hace
 * falta MFA, y el *loader* de la ruta lo convierte en una redirección al
 * inicio de sesión.
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
 * Indica si la sesión actual debe completar la MFA: está autenticada pero en
 * un nivel inferior al que exigen los factores del usuario (una sesión `aal1`
 * que debe subir a `aal2`). Sin sesión devuelve `false`, porque de eso se
 * encarga la guarda de autenticación de la ruta.
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
