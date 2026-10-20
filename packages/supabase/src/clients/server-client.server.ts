import { createServerClient, parseCookieHeader } from '@supabase/ssr';

import { getRequest, setCookie } from '@tanstack/react-start/server';

import { type Database } from '../database.types';
import { getSupabaseClientKeys } from '../get-supabase-client-keys';

/**
 * Cliente de Supabase de servidor con la sesión del usuario.
 *
 * Lee las *cookies* de la petición entrante y, si Supabase refresca la sesión,
 * escribe las *cookies* nuevas en la respuesta, todo con las utilidades de
 * TanStack Start. Usa la clave pública, así que sus consultas se ejecutan con
 * la identidad del usuario y están sujetas a la RLS. Es el cliente por defecto
 * de las *server functions*, los *loaders* y los *middleware*.
 */
export function getSupabaseServerClient<GenericSchema = Database>() {
  const keys = getSupabaseClientKeys();

  return createServerClient<GenericSchema>(keys.url, keys.publicKey, {
    cookieOptions: {
      // Las cookies de sesión solo se marcan como Secure en producción (HTTPS),
      // para que el desarrollo local sobre http://localhost siga funcionando.
      secure: process.env.NODE_ENV === 'production',
    },
    cookies: {
      getAll() {
        const header = getRequest().headers.get('cookie') ?? '';

        return parseCookieHeader(header).map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          setCookie(name, value, options),
        );
      },
    },
  });
}
