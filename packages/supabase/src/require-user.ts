/**
 * Comprobación de sesión obligatoria en el servidor.
 *
 * `requireUser` es la puerta de entrada de toda petición autenticada: lo usan
 * el *middleware* de autenticación de las *server functions*, los *loaders*
 * de las rutas privadas y la API del CMS. Verifica el JWT con `getClaims`
 * (que comprueba la firma, no solo lee la *cookie*), exige completar la MFA
 * cuando el usuario la tiene activada y devuelve los datos del usuario o la
 * ruta a la que hay que redirigirle.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  checkRequiresMultiFactorAuthentication,
  checkTokenRequiresMultiFactorAuthentication,
} from './check-requires-mfa';
import type { JWTUserData } from './types';

type SuccessResult = {
  error: null;
  data: JWTUserData;
};

type AuthenticationErrorResult = {
  error: AuthenticationError;
  data: null;
  redirectTo: string;
};

type MultiAuthErrorResult = {
  error: MultiFactorAuthError;
  data: null;
  redirectTo: string;
};

// Rutas por defecto; deben coincidir con las de apps/web/src/config/paths.config.ts.
const DEFAULT_SIGN_IN_PATH = '/auth/sign-in';
const DEFAULT_MFA_VERIFY_PATH = '/auth/verify';

/**
 * Exige que la petición tenga una sesión válida.
 *
 * @param client Cliente de Supabase con la sesión de la petición.
 * @param options.verifyMfa Si es `true` (por defecto), un usuario con MFA
 *   activada y sesión `aal1` se trata como no autenticado y se le envía a
 *   verificar el segundo factor.
 * @param options.next Ruta a la que volver tras iniciar sesión.
 * @param options.signInPath Sustituye la ruta de inicio de sesión por defecto.
 * @param options.mfaVerifyPath Sustituye la ruta de verificación MFA por
 *   defecto.
 * @returns `{ data }` con los datos del JWT, o `{ error, redirectTo }` si falta
 *   la sesión o el segundo factor.
 */
export async function requireUser(
  client: SupabaseClient,
  options?: {
    verifyMfa?: boolean;
    next?: string;
    /**
     * JWT explícito que verificar, para clientes con token *bearer* (por
     * ejemplo, una app móvil o nativa).
     */
    token?: string;
    signInPath?: string;
    mfaVerifyPath?: string;
  },
): Promise<SuccessResult | (AuthenticationErrorResult | MultiAuthErrorResult)> {
  const { data, error } = await client.auth.getClaims(options?.token);

  const signInPath = options?.signInPath ?? DEFAULT_SIGN_IN_PATH;
  const mfaVerifyPath = options?.mfaVerifyPath ?? DEFAULT_MFA_VERIFY_PATH;

  if (!data?.claims || error) {
    return {
      data: null,
      error: new AuthenticationError(),
      redirectTo: getRedirectTo(signInPath, options?.next),
    };
  }

  const { verifyMfa = true } = options ?? {};

  if (verifyMfa) {
    const requiresMfa = options?.token
      ? await checkTokenRequiresMultiFactorAuthentication(client, options.token)
      : await checkRequiresMultiFactorAuthentication(client);

    // Si el usuario tiene MFA y aún no la ha completado en esta sesión, se le
    // envía a la página de verificación del segundo factor.
    if (requiresMfa) {
      return {
        data: null,
        error: new MultiFactorAuthError(),
        redirectTo: getRedirectTo(mfaVerifyPath, options?.next),
      };
    }
  }

  // `app_metadata` solo lo puede escribir el servidor, así que el rol que
  // contiene es fiable. El superadministrador exige además una sesión `aal2`.
  const role = data.claims.app_metadata?.role;

  return {
    error: null,
    data: {
      is_anonymous: data.claims.is_anonymous || false,
      aal: data.claims.aal,
      email: data.claims.email,
      phone: data.claims.phone,
      is_superadmin: role === 'super-admin' && data.claims.aal === 'aal2',
      has_cms_access: data.claims.app_metadata?.cms_access === 'true',
      id: data.claims.sub,
      amr: data.claims.amr,
    },
  };
}

class AuthenticationError extends Error {
  constructor() {
    super(`Authentication required`);
  }
}

export class MultiFactorAuthError extends Error {
  constructor() {
    super(`Multi-factor authentication required`);
  }
}

function getRedirectTo(path: string, next?: string) {
  return path + (next ? `?next=${next}` : '');
}
