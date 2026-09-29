/**
 * WebAuthn error code raised when a passkey ceremony is aborted — e.g. the
 * user dismisses the browser credential prompt. The `WebAuthnError` class and
 * its type guard are not re-exported from `@supabase/supabase-js`, so we match
 * on the (WebAuthn-specific) error code instead.
 *
 * @see https://supabase.com/docs/guides/auth/passkeys
 */
const PASSKEY_CEREMONY_ABORTED_CODE = 'ERROR_CEREMONY_ABORTED';

/**
 * @name isPasskeyCeremonyCancelled
 * @description
 * Returns `true` when a passkey (WebAuthn) error represents the user
 * dismissing or aborting the browser credential prompt. This is a routine,
 * expected action — not a failure — so callers should avoid surfacing a
 * destructive error message when it happens.
 */
export function isPasskeyCeremonyCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === PASSKEY_CEREMONY_ABORTED_CODE
  );
}
