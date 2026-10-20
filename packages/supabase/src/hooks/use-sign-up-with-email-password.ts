import { useMutation } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';

interface Credentials {
  email: string;
  password: string;
  emailRedirectTo: string;
  captchaToken?: string;
}

const _WeakPasswordReasons = ['length', 'characters', 'pwned'] as const;

export type WeakPasswordReason = (typeof _WeakPasswordReasons)[number];

/**
 * Error que se lanza cuando Supabase rechaza la contraseña por débil, con los
 * motivos (longitud, caracteres o aparición en filtraciones conocidas) para
 * que el formulario pueda explicarlos.
 */
export class WeakPasswordError extends Error {
  readonly code = 'weak_password';
  readonly reasons: WeakPasswordReason[];

  constructor(reasons: WeakPasswordReason[]) {
    super('weak_password');
    this.name = 'WeakPasswordError';
    this.reasons = reasons;
  }
}

/** Mutación de registro con email y contraseña. */
export function useSignUpWithEmailAndPassword() {
  const client = useSupabase();
  const mutationKey = ['auth', 'sign-up-with-email-password'];

  const mutationFn = async (params: Credentials) => {
    const { emailRedirectTo, captchaToken, ...credentials } = params;

    const response = await client.auth.signUp({
      ...credentials,
      options: {
        emailRedirectTo,
        captchaToken,
      },
    });

    if (response.error) {
      // La contraseña débil (AuthWeakPasswordError) se convierte en un error
      // propio para conservar los motivos.
      if (response.error.code === 'weak_password') {
        const errorObj = response.error as unknown as {
          reasons?: WeakPasswordReason[];
        };

        throw new WeakPasswordError(errorObj.reasons ?? []);
      }

      throw response.error;
    }

    const user = response.data?.user;
    const identities = user?.identities ?? [];

    // Si el email ya está registrado, Supabase devuelve un usuario sin
    // identidades (en lugar de un error, para no revelarlo).
    if (identities.length === 0) {
      throw new Error('User already registered');
    }

    return response.data;
  };

  return useMutation({
    mutationKey,
    mutationFn,
  });
}
