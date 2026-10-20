import { createServerClient } from '@supabase/ssr';

import { type Database } from '../database.types';
import { getSupabaseClientKeys } from '../get-supabase-client-keys';

/**
 * Cliente de Supabase de servidor autenticado con un JWT *bearer* (sin
 * *cookies*).
 *
 * Está pensado para clientes de API que no usan *cookies*, como una app móvil
 * o nativa que guarda la sesión en su propio almacenamiento seguro y envía la
 * cabecera `Authorization: Bearer`. Hoy ninguna ruta de la web lo usa; se
 * mantiene como punto de extensión.
 *
 * El JWT se adjunta como cabecera global, de modo que cada llamada a PostgREST
 * lleva la identidad del usuario y la RLS se aplica igual que con las
 * *cookies*.
 *
 * @param token JWT de acceso del usuario.
 */
export function getSupabaseBearerClient<GenericSchema = Database>(
  token: string,
) {
  const keys = getSupabaseClientKeys();

  return createServerClient<GenericSchema>(keys.url, keys.publicKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
