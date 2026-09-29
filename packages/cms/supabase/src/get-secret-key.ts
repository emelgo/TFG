/**
 * Lectura de la clave secreta de Supabase para la API del CMS.
 *
 * La API del CMS necesita el cliente administrador de Supabase (que ignora
 * RLS) para operaciones que la API pública de Auth y Storage solo permite con
 * la clave secreta: comprobar si un usuario está bloqueado, gestionar usuarios
 * de `auth.users` o listar *buckets*. Se usa el mismo nombre de variable que el
 * resto de PymeKit (`SUPABASE_SECRET_KEY`), de modo que la web y el CMS
 * comparten configuración.
 *
 * Solo debe importarse desde código de servidor: la clave nunca puede llegar
 * al navegador.
 */
import { z } from 'zod';

const message =
  'Falta la variable de entorno SUPABASE_SECRET_KEY (clave secreta de Supabase).';

/**
 * Devuelve la clave secreta de Supabase validada.
 *
 * Se lee en cada llamada, y no al cargar el módulo, para que la ausencia de la
 * variable no rompa el arranque del servidor: el error aparece solo en la
 * petición que la necesita.
 *
 * @throws Si la variable no está definida o está vacía.
 */
export function getSecretKey() {
  return z
    .string({ error: message })
    .min(1, { message })
    .parse(process.env['SUPABASE_SECRET_KEY']);
}
