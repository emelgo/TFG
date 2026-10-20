import type {
  AuthError,
  SignInWithPasswordlessCredentials,
} from '@supabase/supabase-js';

import { useMutation } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';

/**
 * Mutación de inicio de sesión sin contraseña (enlace mágico o código OTP
 * por email o SMS).
 */
export function useSignInWithOtp() {
  const client = useSupabase();
  const mutationKey = ['auth', 'sign-in-with-otp'];

  const mutationFn = async (credentials: SignInWithPasswordlessCredentials) => {
    const result = await client.auth.signInWithOtp(credentials);

    if (result.error) {
      if (shouldIgnoreError(result.error, credentials)) {
        console.warn(
          `Ignoring error during development: ${result.error.message}`,
        );

        return {} as never;
      }

      throw result.error.message;
    }

    return result.data;
  };

  return useMutation({
    mutationFn,
    mutationKey,
  });
}

export default useSignInWithOtp;

function shouldIgnoreError(
  error: AuthError,
  credentials: SignInWithPasswordlessCredentials,
) {
  if (isSmsProviderNotSetupError(error.message)) {
    return true;
  }

  // [TFG] RNF-02: en el inicio de sesión (shouldCreateUser === false), Supabase
  // Auth devuelve "otp_disabled" / "Signups not allowed for otp" si la cuenta
  // no existe y tiene éxito si existe; sería un oráculo para averiguar qué
  // emails están registrados. Se ignora el error SOLO cuando no se crea
  // usuario, para que la respuesta sea idéntica exista o no la cuenta. En el
  // registro (shouldCreateUser !== false) sí se muestran los errores reales de
  // "registro desactivado".
  if (
    credentials.options?.shouldCreateUser === false &&
    isOtpSignupsDisabledError(error)
  ) {
    return true;
  }

  return false;
}

function isSmsProviderNotSetupError(error: string) {
  return error.includes(`sms Provider could not be found`);
}

function isOtpSignupsDisabledError(error: AuthError) {
  return (
    error.code === 'otp_disabled' ||
    error.message.includes('Signups not allowed for otp')
  );
}
