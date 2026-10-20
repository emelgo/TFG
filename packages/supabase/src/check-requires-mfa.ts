/**
 * Comprobación de si la sesión necesita completar la autenticación
 * multifactor (MFA).
 *
 * Supabase indica el nivel de garantía actual de la sesión (`currentLevel`) y
 * el que podría alcanzar (`nextLevel`). Si el usuario tiene un segundo factor
 * verificado, `nextLevel` es `aal2`; si además la sesión sigue en `aal1`, hay
 * que pedirle el segundo factor antes de dejarle continuar. Lo usa
 * `requireUser`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const ASSURANCE_LEVEL_2 = 'aal2';

/**
 * Indica si la sesión actual (leída de las *cookies*) debe completar la MFA:
 * el siguiente nivel posible es `aal2` y el actual todavía no lo es.
 */
export async function checkRequiresMultiFactorAuthentication(
  client: SupabaseClient,
) {
  // Se silencia el aviso de getSession, que aquí es un falso positivo (solo se
  // lee el nivel de garantía). Se podrá quitar cuando se resuelva la incidencia:
  // https://github.com/supabase/auth-js/issues/873
  // @ts-expect-error: suppressGetSessionWarning no forma parte de la API pública
  client.auth.suppressGetSessionWarning = true;

  const assuranceLevel = await client.auth.mfa.getAuthenticatorAssuranceLevel();

  // @ts-expect-error: suppressGetSessionWarning no forma parte de la API pública
  client.auth.suppressGetSessionWarning = false;

  if (assuranceLevel.error) {
    throw new Error(assuranceLevel.error.message);
  }

  const { nextLevel, currentLevel } = assuranceLevel.data;

  return nextLevel === ASSURANCE_LEVEL_2 && nextLevel !== currentLevel;
}

/**
 * Variante de {@link checkRequiresMultiFactorAuthentication} para un JWT
 * *bearer*. El cliente *bearer* no guarda sesión, así que la comprobación
 * basada en sesión respondería en silencio "no hace falta MFA"; por eso se le
 * pasa el token explícitamente.
 */
export async function checkTokenRequiresMultiFactorAuthentication(
  client: SupabaseClient,
  token: string,
) {
  const assuranceLevel =
    await client.auth.mfa.getAuthenticatorAssuranceLevel(token);

  if (assuranceLevel.error || !assuranceLevel.data) {
    throw new Error(
      assuranceLevel.error?.message ?? 'Failed to resolve assurance level',
    );
  }

  const { nextLevel, currentLevel } = assuranceLevel.data;

  return nextLevel === ASSURANCE_LEVEL_2 && nextLevel !== currentLevel;
}
