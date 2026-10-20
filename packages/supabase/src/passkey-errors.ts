/**
 * Código de error de WebAuthn cuando se interrumpe la ceremonia de una
 * *passkey*, por ejemplo porque el usuario cierra el diálogo de credenciales
 * del navegador. `@supabase/supabase-js` no reexporta la clase `WebAuthnError`
 * ni su comprobación de tipo, así que se compara el código de error.
 *
 * @see https://supabase.com/docs/guides/auth/passkeys
 */
const PASSKEY_CEREMONY_ABORTED_CODE = 'ERROR_CEREMONY_ABORTED';

/**
 * Indica si un error de *passkey* (WebAuthn) se debe a que el usuario ha
 * cerrado o cancelado el diálogo del navegador. Es una acción normal, no un
 * fallo, así que la interfaz no debería mostrar un mensaje de error en ese
 * caso.
 */
export function isPasskeyCeremonyCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === PASSKEY_CEREMONY_ABORTED_CODE
  );
}
