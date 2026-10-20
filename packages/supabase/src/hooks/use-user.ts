import { useQuery } from '@tanstack/react-query';

import { requireUser } from '../require-user';
import type { JWTUserData } from '../types';
import { useSupabase } from './use-supabase';

const queryKey = ['supabase:user'];

/**
 * Consulta los datos del usuario de la sesión (a partir del JWT). Admite los
 * datos iniciales que ya cargó el servidor para no repetir la petición.
 */
export function useUser(initialData?: JWTUserData | null) {
  const client = useSupabase();

  const queryFn = async () => {
    const response = await requireUser(client);

    if (response.error) {
      return undefined;
    }

    return response.data;
  };

  return useQuery({
    queryFn,
    queryKey,
    initialData,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
