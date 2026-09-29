/**
 * Clientes de Supabase para las rutas Hono de la API del CMS.
 *
 * La API del CMS se ejecuta dentro del servidor de la web (montada en
 * `/api/cms/*`), así que comparte con ella el proyecto de Supabase y las
 * *cookies* de sesión: un usuario que ha iniciado sesión en la web también la
 * tiene aquí, sin un segundo inicio de sesión (ADR-011).
 *
 * Expone dos clientes:
 *  - `getSupabaseClient(c)`: cliente con la sesión del usuario (aplica RLS),
 *    construido a partir de las *cookies* de la petición Hono.
 *  - `getSupabaseAdminClient()`: cliente con la clave secreta (ignora RLS).
 *    Solo lo usan los servicios que ya han comprobado permisos a mano.
 *
 * Las variables de entorno son las mismas que usa el resto de PymeKit:
 * `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLIC_KEY` y `SUPABASE_SECRET_KEY`.
 *
 * [TFG] RF-09 · ADR-011: API del CMS integrada en la web.
 */
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';

import { getSecretKey } from '../get-secret-key';

/**
 * Lee y valida la URL y la clave pública de Supabase.
 *
 * Vite sustituye `import.meta.env.VITE_*` al compilar (también en el bundle de
 * servidor). El respaldo con `process.env` sirve para entornos sin Vite, como
 * los tests o un script de Node.
 */
function getSupabaseClientKeys() {
  return z
    .object({
      url: z.url({ error: 'Falta la variable VITE_SUPABASE_URL' }),
      publicKey: z
        .string({ error: 'Falta la variable VITE_SUPABASE_PUBLIC_KEY' })
        .min(1),
    })
    .parse({
      url:
        import.meta.env?.VITE_SUPABASE_URL ?? process.env['VITE_SUPABASE_URL'],
      publicKey:
        import.meta.env?.VITE_SUPABASE_PUBLIC_KEY ??
        process.env['VITE_SUPABASE_PUBLIC_KEY'],
    });
}

/**
 * Crea un cliente de Supabase con permisos de administrador (ignora RLS).
 *
 * Seguridad: solo debe usarse después de haber comprobado a mano que el
 * usuario tiene permiso para la operación (cada servicio que lo usa lo
 * justifica en su código).
 */
export function getSupabaseAdminClient() {
  const { url } = getSupabaseClientKeys();

  return createClient(url, getSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Devuelve el cliente de Supabase con la sesión del usuario de la petición.
 *
 * El *middleware* de autenticación del CMS crea el cliente, verifica el JWT y
 * lo guarda en el contexto (`c.set('supabase', …)`). Si ya existe se
 * reutiliza: así todas las piezas de una misma petición (autorización,
 * Drizzle, servicios) trabajan con la misma sesión verificada y el *token* no
 * se refresca dos veces.
 */
export function getSupabaseClient(c: Context) {
  const existing = c.get('supabase');

  if (existing) {
    return existing;
  }

  return createSupabaseRequestClient(c);
}

/**
 * Crea un cliente de Supabase nuevo que lee la sesión de las *cookies* de la
 * petición y, si Supabase refresca el *token*, escribe las *cookies* nuevas en
 * la respuesta Hono.
 */
export function createSupabaseRequestClient(c: Context) {
  const { url, publicKey } = getSupabaseClientKeys();

  return createServerClient(url, publicKey, {
    cookieOptions: {
      // Igual que el cliente de servidor de la web: cookies `Secure` solo en
      // producción (HTTPS), para que el desarrollo local por http funcione.
      secure: process.env['NODE_ENV'] === 'production',
    },
    cookies: {
      getAll() {
        const cookieHeader = c.req.header('cookie') ?? '';

        return parseCookieHeader(cookieHeader).map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          setCookie(c, name, value, {
            ...options,
            sameSite: options.sameSite as
              | 'lax'
              | 'strict'
              | 'none'
              | 'Strict'
              | 'Lax'
              | 'None'
              | undefined,
            priority: getPriority(options.priority),
          });
        });
      },
    },
  });
}

function getPriority(priority?: string) {
  switch (priority) {
    case 'low':
      return 'Low';

    case 'high':
      return 'High';

    case 'medium':
    case 'Medium':
      return 'Medium';
  }
}
