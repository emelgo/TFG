/**
 * Lectura de la clave secreta de Supabase.
 *
 * La clave secreta (antes llamada *service role key*) da acceso total a la
 * base de datos saltándose la RLS. Este módulo solo se importa desde código de
 * servidor (sufijo `.server.ts`) para que nunca acabe en el paquete del
 * navegador.
 */
import * as z from 'zod';

const message =
  'Invalid Supabase Secret Key. Please add the environment variable SUPABASE_SECRET_KEY.';

/**
 * Devuelve la clave secreta de Supabase (`SUPABASE_SECRET_KEY`) y falla con un
 * mensaje claro si no está definida.
 *
 * SOLO para código de servidor: nunca debe llegar al cliente.
 */
export function getSupabaseSecretKey() {
  return z
    .string({
      error: message,
    })
    .min(1, {
      message: message,
    })
    .parse(process.env.SUPABASE_SECRET_KEY);
}

/**
 * Muestra un aviso en desarrollo cada vez que se usa la clave secreta, como
 * recordatorio de que ese cliente se salta la RLS.
 */
export function warnServiceRoleKeyUsage() {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[Dev Only] This is a simple warning to let you know you are using the Supabase Secret Key. This key bypasses RLS and should only be used in server-side code. Please make sure it's the intended usage.`,
    );
  }
}
