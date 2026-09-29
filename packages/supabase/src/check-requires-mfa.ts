import type { SupabaseClient } from '@supabase/supabase-js';

const ASSURANCE_LEVEL_2 = 'aal2';

/**
 * @name checkRequiresMultiFactorAuthentication
 * @description Checks if the current session requires multi-factor authentication.
 * We do it by checking that the next assurance level is AAL2 and that the current assurance level is not AAL2.
 * @param client
 */
export async function checkRequiresMultiFactorAuthentication(
  client: SupabaseClient,
) {
  // Suppress the getSession warning. Remove when the issue is fixed.
  // https://github.com/supabase/auth-js/issues/873
  // @ts-expect-error: suppressGetSessionWarning is not part of the public API
  client.auth.suppressGetSessionWarning = true;

  const assuranceLevel = await client.auth.mfa.getAuthenticatorAssuranceLevel();

  // @ts-expect-error: suppressGetSessionWarning is not part of the public API
  client.auth.suppressGetSessionWarning = false;

  if (assuranceLevel.error) {
    throw new Error(assuranceLevel.error.message);
  }

  const { nextLevel, currentLevel } = assuranceLevel.data;

  return nextLevel === ASSURANCE_LEVEL_2 && nextLevel !== currentLevel;
}

/**
 * @name checkTokenRequiresMultiFactorAuthentication
 * @description Bearer-token variant of {@link checkRequiresMultiFactorAuthentication}.
 * The bearer client has no session storage, so the session-based check would
 * silently report "no MFA required".
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
