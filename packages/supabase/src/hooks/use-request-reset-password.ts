import { useMutation } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';

interface RequestPasswordResetMutationParams {
  email: string;
  redirectTo: string;
  captchaToken?: string;
}

/**
 * Mutación que solicita el restablecimiento de contraseña: Supabase envía un
 * correo con un enlace que lleva a `redirectTo`, donde el usuario elige la
 * contraseña nueva.
 */
export function useRequestResetPassword() {
  const client = useSupabase();
  const mutationKey = ['auth', 'reset-password'];

  const mutationFn = async (params: RequestPasswordResetMutationParams) => {
    const { error, data } = await client.auth.resetPasswordForEmail(
      params.email,
      {
        redirectTo: params.redirectTo,
        captchaToken: params.captchaToken,
      },
    );

    if (error) {
      throw error;
    }

    return data;
  };

  return useMutation({
    mutationFn,
    mutationKey,
  });
}
