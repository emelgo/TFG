import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';
import { USER_IDENTITIES_QUERY_KEY } from './use-user-identities';

interface Credentials {
  email: string;
  password: string;
  redirectTo: string;
}

/**
 * Mutación que añade email y contraseña a un usuario que se registró con un
 * proveedor OAuth, y refresca la sesión e identidades al terminar.
 */
export function useLinkIdentityWithEmailPassword() {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const mutationKey = ['auth', 'link-email-password'];

  const mutationFn = async (credentials: Credentials) => {
    const { email, password, redirectTo } = credentials;

    const { error } = await client.auth.updateUser(
      {
        email,
        password,
        data: {
          // Marca que el usuario ya tiene contraseña: si se creó con OAuth,
          // Supabase no añade la identidad de email al fijar la contraseña y
          // la interfaz no tendría otra forma de saberlo.
          hasPassword: true,
        },
      },
      { emailRedirectTo: redirectTo },
    );

    if (error) {
      throw error.message ?? error;
    }

    await client.auth.refreshSession();
  };

  return useMutation({
    mutationKey,
    mutationFn,
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: USER_IDENTITIES_QUERY_KEY,
      });
    },
  });
}
